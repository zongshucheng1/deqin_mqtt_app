"""Read-only, offline static verification of the actual DCloud Android APK.

Usage:
  python app/tools/verify-apk.py --apk path/to/app.apk --report path/to/report.json
  python app/tools/verify-apk.py --apk path/to/app.apk --report report.json --required-abi armeabi-v7a arm64-v8a x86
  python app/tools/verify-apk.py --apk path/to/dev.apk --report report.json --package-name com.deqin.inout.dev
  python app/tools/verify-apk.py --self-test

Requires Python standard library, Java, and Android SDK build-tools/35.0.0.
Nothing is installed, extracted, uploaded or executed from the APK. A static PASS
does not prove runtime UTS loading, AndroidKeyStore behavior, PLC or printer access.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
from datetime import datetime, timezone
import zipfile
import zlib

PACKAGE = "com.deqin.inout"
APP_ID = "__UNI__4275A0F"
ANDROID = "http://schemas.android.com/apk/res/android"
EXPECTED_CLASSES = {
    "Lcom/deqin/inout/host/android/HostBridge;": {"configureFromServer", "start", "status"},
    "Lcom/deqin/inout/host/android/SessionBridge;": {"getSessionToken", "setSessionToken", "clearSessionToken"},
    "Lcom/deqin/inout/host/android/HostService;": {"onStartCommand"},
    "Lcom/deqin/inout/host/android/HostBootReceiver;": {"onReceive"},
    "Lcom/deqin/inout/host/android/SqliteEvidenceStore;": set(),
    "Lcom/deqin/inout/host/core/Mqtt311;": set(),
    "Lcom/deqin/inout/host/security/SessionTokenVault;": {"getToken", "setToken", "clearToken"},
    "Lcom/deqin/inout/host/security/AesGcmSessionCipher;": {"encrypt", "decrypt"},
    "Lcom/deqin/inout/host/printing/IppClient;": {"probe", "submit", "status"},
    "Lcom/deqin/inout/host/printing/IppTransport;": {"submit", "status"},
    "Luts/sdk/modules/deqinHost/IndexKt;": {
        "getSessionTokenByJs", "setSessionTokenByJs", "clearSessionTokenByJs",
        "configureFromServerByJs", "probePrinterByJs", "getHostStatusByJs",
    },
}
PERMISSIONS = {
    "android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CHANGE_NETWORK_STATE", "android.permission.CAMERA",
    "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
    "android.permission.POST_NOTIFICATIONS", "android.permission.RECEIVE_BOOT_COMPLETED",
}
ABI_ELF = {"armeabi-v7a": (1, 40), "arm64-v8a": (2, 183), "x86": (1, 3), "x86_64": (2, 62)}
REQUIRED_NATIVE = {"libweexcore.so", "libweexjsb.so", "libweexjss.so", "libweexjst.so", "libuts-runtime.so"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def android_package_name(value):
    """Validate the expected application ID without changing native class names."""
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", value):
        raise argparse.ArgumentTypeError("Android package name must contain at least two dot-separated segments, each starting with a letter and containing only letters, digits or underscores")
    return value


def span(data, offset, size):
    require(0 <= offset <= len(data) and 0 <= size <= len(data) - offset, "Binary offset/size outside file")
    return data[offset:offset + size]


def u32(data, offset):
    return struct.unpack("<I", span(data, offset, 4))[0]


def u16(data, offset):
    return struct.unpack("<H", span(data, offset, 2))[0]


def elf_matches(header, abi):
    elf_class, machine = ABI_ELF[abi]
    return len(header) >= 20 and header[:4] == b"\x7fELF" and header[4] == elf_class and header[5] == 1 and u16(header, 18) == machine


def uleb(data, offset):
    value = 0
    for shift in range(0, 35, 7):
        byte = span(data, offset, 1)[0]
        offset += 1
        require(shift < 28 or byte <= 15, "ULEB128 exceeds uint32")
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, offset
    raise ValueError("Unterminated ULEB128")


def string_pool(chunk):
    """Android ResStringPool, both UTF-8 and UTF-16 encodings."""
    header = u16(chunk, 2)
    count, flags, start = u32(chunk, 8), u32(chunk, 16), u32(chunk, 20)
    require(count <= 2_000_000, "Excessive XML string count")
    span(chunk, header, count * 4)

    def length8(pos):
        first = span(chunk, pos, 1)[0]
        return (((first & 127) << 8) | span(chunk, pos + 1, 1)[0], pos + 2) if first & 128 else (first, pos + 1)

    def length16(pos):
        first = u16(chunk, pos)
        return (((first & 32767) << 16) | u16(chunk, pos + 2), pos + 4) if first & 32768 else (first, pos + 2)

    result = []
    for index in range(count):
        pos = start + u32(chunk, header + index * 4)
        if flags & 256:
            _, pos = length8(pos)
            length, pos = length8(pos)
            result.append(span(chunk, pos, length).decode("utf-8"))
            require(span(chunk, pos + length, 1) == b"\0", "XML UTF-8 string terminator missing")
        else:
            length, pos = length16(pos)
            result.append(span(chunk, pos, length * 2).decode("utf-16-le"))
            require(span(chunk, pos + length * 2, 2) == b"\0\0", "XML UTF-16 string terminator missing")
    return result


def axml(data):
    """Decode structural manifest attributes; do not infer values by grepping strings."""
    require(u16(data, 0) == 3 and u32(data, 4) == len(data), "Not a complete Android binary XML document")
    strings, stack, root = [], [], None
    pos = u16(data, 2)
    while pos < len(data):
        kind, header, size = u16(data, pos), u16(data, pos + 2), u32(data, pos + 4)
        require(size >= header >= 8, "Invalid XML chunk header")
        chunk = span(data, pos, size)
        if kind == 1:
            strings = string_pool(chunk)
        elif kind == 0x102:
            require(header >= 16, "Invalid XML node header")
            name = strings[u32(chunk, 20)]
            first, attr_size, count = u16(chunk, 24) + 16, u16(chunk, 26), u16(chunk, 28)
            require(attr_size >= 20, "Unsupported XML attribute size")
            node = {"tag": name, "attributes": {}, "children": []}
            for index in range(count):
                attr = span(chunk, first + index * attr_size, attr_size)
                namespace, name_index, raw, value = u32(attr, 0), u32(attr, 4), u32(attr, 8), u32(attr, 16)
                namespace = "" if namespace == 0xffffffff else strings[namespace]
                key = ("android:" if namespace == ANDROID else "") + strings[name_index]
                require(key not in node["attributes"], "Duplicate manifest attribute")
                kind_value = attr[15]
                if kind_value == 3:
                    value = strings[value]
                elif kind_value == 0x12:
                    value = value != 0
                elif kind_value not in {0x10, 0x11}:
                    value = strings[raw] if raw != 0xffffffff else {"type": kind_value, "value": value}
                node["attributes"][key] = value
            if stack:
                stack[-1]["children"].append(node)
            else:
                require(root is None, "Multiple XML roots")
                root = node
            stack.append(node)
        elif kind == 0x103:
            require(stack and stack[-1]["tag"] == strings[u32(chunk, 20)], "Unbalanced XML end element")
            stack.pop()
        pos += size
    require(pos == len(data) and root is not None and not stack, "Incomplete XML element tree")
    return root


def dex(data):
    """Read DEX string/type/class/method tables and class-data definitions.

    Reject unsupported container/compact layouts rather than reporting guessed classes.
    This is a bounds/integrity/table check, not a bytecode verifier or runtime execution.
    """
    require(data[:4] == b"dex\n" and data[7:8] == b"\0", "Not standard DEX")
    version = data[4:7].decode("ascii")
    require(version in {"035", "037", "038", "039", "040"}, "Unsupported DEX version/layout: " + version)
    require(u32(data, 32) == len(data) and u32(data, 36) == 112 and u32(data, 40) == 0x12345678, "Unsupported DEX header/endian/container")
    require(hashlib.sha1(data[32:]).digest() == span(data, 12, 20), "DEX SHA1 mismatch")
    require(zlib.adler32(data[12:]) & 0xffffffff == u32(data, 8), "DEX Adler32 mismatch")
    string_count, string_offset = u32(data, 56), u32(data, 60)
    type_count, type_offset = u32(data, 64), u32(data, 68)
    proto_count, proto_offset = u32(data, 72), u32(data, 76)
    method_count, method_offset = u32(data, 88), u32(data, 92)
    class_count, class_offset = u32(data, 96), u32(data, 100)
    require(string_count <= 2_000_000 and type_count <= 65535 and class_count <= type_count, "Invalid/excessive DEX table size")
    for offset, size in [(string_offset, string_count * 4), (type_offset, type_count * 4),
                         (proto_offset, proto_count * 12), (method_offset, method_count * 8), (class_offset, class_count * 32)]:
        span(data, offset, size)
    strings = []
    for index in range(string_count):
        length, start = uleb(data, u32(data, string_offset + index * 4))
        end = data.find(b"\0", start)
        require(end >= start, "Unterminated DEX string")
        # MUTF-8 encodes NUL as C0 80 and UTF-16 surrogate code units independently.
        value = data[start:end].replace(b"\xc0\x80", b"\0").decode("utf-8", "surrogatepass")
        require(len(value.encode("utf-16-le", "surrogatepass")) // 2 == length, "DEX UTF-16 string length mismatch")
        strings.append(value)
    types = [strings[u32(data, type_offset + index * 4)] for index in range(type_count)]
    methods = []
    for index in range(method_count):
        item = method_offset + index * 8
        class_index, proto_index, name_index = u16(data, item), u16(data, item + 2), u32(data, item + 4)
        require(class_index < type_count and proto_index < proto_count and name_index < string_count, "Invalid DEX method index")
        return_index = u32(data, proto_offset + proto_index * 12 + 4)
        require(return_index < type_count, "Invalid DEX return type")
        methods.append({"class": types[class_index], "name": strings[name_index], "returnType": types[return_index]})
    classes = {}
    for index in range(class_count):
        item = class_offset + index * 32
        class_index, class_data = u32(data, item), u32(data, item + 24)
        require(class_index < type_count, "Invalid DEX class index")
        descriptor = types[class_index]
        require(descriptor not in classes, "Duplicate DEX class definition")
        defined = []
        if class_data:
            counts = []
            for _ in range(4):
                count, class_data = uleb(data, class_data)
                counts.append(count)
            for _ in range(counts[0] + counts[1]):
                _, class_data = uleb(data, class_data)
                _, class_data = uleb(data, class_data)
            for count in counts[2:]:
                method_index = 0
                for _ in range(count):
                    delta, class_data = uleb(data, class_data)
                    flags, class_data = uleb(data, class_data)
                    code, class_data = uleb(data, class_data)
                    method_index += delta
                    require(method_index < method_count and methods[method_index]["class"] == descriptor, "Invalid class-data method definition")
                    if code:
                        span(data, code, 16)
                    if descriptor in EXPECTED_CLASSES:
                        defined.append({**methods[method_index], "accessFlags": flags, "hasCode": code != 0})
        classes[descriptor] = defined
    return {"version": version, "strings": strings, "classes": classes,
            "counts": {"strings": string_count, "types": type_count, "methods": method_count, "classes": class_count}}


def tool(command):
    completed = subprocess.run(command, capture_output=True, timeout=120, shell=False)
    return {"command": [str(item) for item in command], "exitCode": completed.returncode,
            "stdout": completed.stdout.decode("utf-8", "replace"), "stderr": completed.stderr.decode("utf-8", "replace")}


def verify(apk, sdk, report, required_abis, package_name=PACKAGE):
    package_name = android_package_name(package_name)
    checks = report["checks"]

    def check(name, valid, evidence):
        checks.append({"name": name, "passed": bool(valid), "evidence": evidence})

    sdk = sdk / "build-tools" / "35.0.0"
    aapt = sdk / ("aapt2.exe" if os.name == "nt" else "aapt2")
    signer = sdk / "lib" / "apksigner.jar"
    java_home = Path(os.environ.get("JAVA_HOME", "")) / "bin" / ("java.exe" if os.name == "nt" else "java")
    java = str(java_home) if java_home.is_file() else shutil.which("java")
    require(aapt.is_file() and signer.is_file() and java, "SDK35 aapt2/apksigner.jar and Java are required")
    report["tools"] = {
        "badging": tool([str(aapt), "dump", "badging", str(apk)]),
        "manifestTree": tool([str(aapt), "dump", "xmltree", "--file", "AndroidManifest.xml", str(apk)]),
        "signature": tool([java, "-jar", str(signer), "verify", "--verbose", "--print-certs", "--min-sdk-version", "26", str(apk)]),
    }
    for name, result in report["tools"].items():
        check("sdk." + name, result["exitCode"] == 0, {"exitCode": result["exitCode"]})
    report["apk"] = {"path": str(apk), "size": apk.stat().st_size}
    with apk.open("rb") as source:
        report["apk"]["sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
    with zipfile.ZipFile(apk) as archive:
        infos = archive.infolist()
        names = [item.filename for item in infos]
        require(len(names) == len(set(names)), "APK has duplicate ZIP entry names")
        require(len(names) <= 100_000 and sum(item.file_size for item in infos) <= 2 * 1024**3, "APK exceeds static inspection limits")
        bad_crc = archive.testzip()
        check("zip.crc", bad_crc is None, {"badEntry": bad_crc, "entries": len(names)})

        def read(name, limit=256 * 1024 * 1024):
            info = archive.getinfo(name)
            require(info.file_size <= limit, "APK entry too large: " + name)
            return archive.read(name)

        manifest = axml(read("AndroidManifest.xml", 8 * 1024 * 1024))
        attrs = manifest["attributes"]
        check("manifest.package", attrs.get("package") == package_name, attrs.get("package"))
        check("aapt.package", bool(re.search(r"^package: name='" + re.escape(package_name) + r"'", report["tools"]["badging"]["stdout"], re.M)), package_name)
        sdk_nodes = [node for node in manifest["children"] if node["tag"] == "uses-sdk"]
        require(len(sdk_nodes) == 1, "Exactly one merged uses-sdk is required")
        sdk_attrs = sdk_nodes[0]["attributes"]
        check("manifest.minSdk", str(sdk_attrs.get("android:minSdkVersion")) == "26", sdk_attrs.get("android:minSdkVersion"))
        check("manifest.targetSdk", str(sdk_attrs.get("android:targetSdkVersion")) == "35", sdk_attrs.get("android:targetSdkVersion"))
        permissions = {node["attributes"].get("android:name") for node in manifest["children"] if node["tag"] in {"uses-permission", "uses-permission-sdk-23"}}
        check("manifest.permissions", PERMISSIONS <= permissions, {"required": sorted(PERMISSIONS), "missing": sorted(PERMISSIONS - permissions), "actual": sorted(p for p in permissions if p)})
        apps = [node for node in manifest["children"] if node["tag"] == "application"]
        require(len(apps) == 1, "Exactly one merged application is required")
        app = apps[0]
        check("manifest.usesCleartextTraffic", app["attributes"].get("android:usesCleartextTraffic") is True, app["attributes"].get("android:usesCleartextTraffic"))
        if "android:networkSecurityConfig" in app["attributes"]:
            report["warnings"].append("Merged networkSecurityConfig is present: its higher-priority domain/base policy requires separate inspection; this check proves only the explicit usesCleartextTraffic flag.")

        def component(tag, expected):
            found = []
            for node in app["children"]:
                name = node["attributes"].get("android:name", "")
                full = package_name + name if name.startswith(".") else package_name + "." + name if "." not in name else name
                if node["tag"] == tag and full == expected:
                    found.append(node)
            check("manifest." + tag + "." + expected, len(found) == 1, {"count": len(found)})
            return found[0] if len(found) == 1 else {"attributes": {}, "children": []}

        service = component("service", "com.deqin.inout.host.android.HostService")
        service_attrs = service["attributes"]
        service_type = service_attrs.get("android:foregroundServiceType")
        connected = bool(service_type & 16) if isinstance(service_type, int) and not isinstance(service_type, bool) else "connectedDevice" in str(service_type).split("|")
        check("manifest.hostService.connectedDevice", connected, service_type)
        check("manifest.hostService.exportedFalse", service_attrs.get("android:exported") is False, service_attrs.get("android:exported"))
        check("manifest.hostService.stopWithTaskFalse", service_attrs.get("android:stopWithTask") is False, service_attrs.get("android:stopWithTask"))
        receiver = component("receiver", "com.deqin.inout.host.android.HostBootReceiver")
        check("manifest.bootReceiver.exportedFalse", receiver["attributes"].get("android:exported") is False, receiver["attributes"].get("android:exported"))
        check("manifest.bootReceiver.enabled", receiver["attributes"].get("android:enabled", True) is True, receiver["attributes"].get("android:enabled", True))
        actions = {child["attributes"].get("android:name") for intent in receiver["children"] if intent["tag"] == "intent-filter" for child in intent["children"] if child["tag"] == "action"}
        check("manifest.bootReceiver.actions", {"android.intent.action.BOOT_COMPLETED", "android.intent.action.MY_PACKAGE_REPLACED"} <= actions, sorted(actions))
        report["manifest"] = {"package": attrs.get("package"), "minSdk": sdk_attrs.get("android:minSdkVersion"), "targetSdk": sdk_attrs.get("android:targetSdkVersion"), "service": service_attrs, "receiver": receiver["attributes"]}

        prefix = "assets/apps/" + APP_ID + "/www/"
        manifest_name = prefix + "manifest.json"
        check("resources.appManifestPresent", manifest_name in names, manifest_name)
        if manifest_name in names:
            app_manifest = json.loads(read(manifest_name, 4 * 1024 * 1024).decode("utf-8-sig"))
            check("resources.appId", app_manifest.get("id", app_manifest.get("appid")) == APP_ID, app_manifest.get("id", app_manifest.get("appid")))
        for resource in ["app-service.js", "app-config-service.js", "app-config.js", "__uniappview.html"]:
            name = prefix + resource
            check("resources." + resource, name in names and archive.getinfo(name).file_size > 0, {"path": name, "size": archive.getinfo(name).file_size if name in names else 0})
        report["resources"] = {"appId": APP_ID, "wwwPrefix": prefix, "wwwEntryCount": sum(name.startswith(prefix) for name in names)}

        dex_names = sorted(name for name in names if re.fullmatch(r"classes(?:[0-9]+)?\.dex", name))
        check("dex.present", "classes.dex" in dex_names, dex_names)
        all_classes, all_strings, summaries = {}, set(), []
        for name in dex_names:
            parsed = dex(read(name))
            require(not set(all_classes) & parsed["classes"].keys(), "Duplicate class across DEX files")
            all_classes.update({key: {"dex": name, "methods": value} for key, value in parsed["classes"].items()})
            all_strings.update(parsed["strings"])
            summaries.append({"entry": name, "version": parsed["version"], **parsed["counts"]})
        report["dex"] = {"files": summaries, "requiredClassEvidence": {}}
        for descriptor, required_methods in EXPECTED_CLASSES.items():
            found = all_classes.get(descriptor)
            defined = {item["name"] for item in found["methods"] if item["hasCode"]} if found else set()
            check("dex.class." + descriptor, found is not None and required_methods <= defined, {"defined": found is not None, "missingDefinedMethods": sorted(required_methods - defined)})
            if found:
                report["dex"]["requiredClassEvidence"][descriptor] = found
        uts = all_classes.get("Luts/sdk/modules/deqinHost/IndexKt;", {}).get("methods", [])
        # Android writes and clears ignore the synchronous return value. Recent
        # UTS bridges return an empty string and older APKs use void.
        session_returns = {
            "getSessionTokenByJs": ("Ljava/lang/String;",),
            "setSessionTokenByJs": ("V", "Ljava/lang/String;"),
            "clearSessionTokenByJs": ("V", "Ljava/lang/String;"),
        }
        for method, return_types in session_returns.items():
            matches = [item for item in uts if item["name"] == method and item["hasCode"] and item["accessFlags"] & 8]
            check("dex.synchronousUts." + method, any(item["returnType"] in return_types for item in matches), {"expectedReturnTypes": return_types, "definitions": matches})
        markers = {"AndroidKeyStore", "AES/GCM/NoPadding", "SESSION_TOKEN_READ_FAILED", "SESSION_TOKEN_WRITE_FAILED", "SESSION_TOKEN_CLEAR_FAILED"}
        check("dex.sessionSecurityStrings", markers <= all_strings, {"missing": sorted(markers - all_strings)})

        abis = sorted({name.split("/")[1] for name in names if re.fullmatch(r"lib/[^/]+/[^/]+\.so", name)})
        report["native"] = {"actualAbis": abis, "requiredAbis": required_abis, "perAbi": {}}
        for abi in required_abis:
            libraries = [name for name in names if re.fullmatch(r"lib/" + re.escape(abi) + r"/[^/]+\.so", name)]
            check("native.arm64Present" if abi == "arm64-v8a" else "native.requiredAbi." + abi, bool(libraries), {"abis": abis, "libraries": libraries})
            missing = sorted(REQUIRED_NATIVE - {name.rsplit("/", 1)[1] for name in libraries})
            check("native.weexAndUtsRuntime." + abi, not missing, {"requiredLibraries": sorted(REQUIRED_NATIVE), "missingLibraries": missing})
            report["native"]["perAbi"][abi] = {"libraryCount": len(libraries), "missingWeexOrUtsLibraries": missing}
            elf_class, machine = ABI_ELF[abi]
            for name in libraries:
                with archive.open(name) as library:
                    header = library.read(64)
                check("native.elf." + name, elf_matches(header, abi), {"expectedElfClass": elf_class, "expectedMachine": machine, "littleEndianRequired": True})


def self_test():
    """Argument and synthetic parser checks; deliberately not an APK or signing proof."""
    tests = 0
    for value in [PACKAGE, "com.deqin.inout.dev", "org.Example_2"]:
        assert android_package_name(value) == value
        tests += 1
    for value in ["", "single", "com..deqin", ".com.deqin", "com.deqin.", "1com.deqin", "com.1deqin", "com.deqin-dev", "com.deqin\n"]:
        try:
            android_package_name(value)
            raise AssertionError("Invalid package name accepted")
        except argparse.ArgumentTypeError:
            tests += 1
    assert uleb(b"\xe5\x8e\x26", 0) == (624485, 3)
    tests += 1
    for malformed in [b"\x80", b"\xff\xff\xff\xff\xff"]:
        try:
            uleb(malformed, 0)
            raise AssertionError("Malformed ULEB accepted")
        except ValueError:
            tests += 1
    # A class definition must exist; merely putting its descriptor in string_ids is insufficient.
    strings = [b"Lfixture/ActualClass;", b"V", b"ping", b"Lfixture/StringOnly;"]
    string_offset, type_offset, proto_offset, method_offset, class_offset, class_data, code = 112, 128, 136, 148, 156, 188, 196
    data = bytearray(214)
    data[:8] = b"dex\n035\0"
    for offset, value in {36:112, 40:0x12345678, 56:4, 60:string_offset, 64:2, 68:type_offset, 72:1, 76:proto_offset, 88:1, 92:method_offset, 96:1, 100:class_offset, 108:class_data}.items():
        struct.pack_into("<I", data, offset, value)
    for index, value in enumerate(strings):
        struct.pack_into("<I", data, string_offset + 4 * index, len(data))
        data.extend(bytes([len(value)]) + value + b"\0")
    struct.pack_into("<II", data, type_offset, 0, 1)
    struct.pack_into("<III", data, proto_offset, 1, 1, 0)
    struct.pack_into("<HHI", data, method_offset, 0, 0, 2)
    struct.pack_into("<IIIIIIII", data, class_offset, 0, 1, 0xffffffff, 0, 0xffffffff, 0, class_data, 0)
    data[class_data:class_data + 8] = bytes([0, 0, 1, 0, 0, 9, code | 128, code >> 7])
    struct.pack_into("<HHHHIIH", data, code, 0, 0, 0, 0, 0, 1, 14)

    def checksum():
        struct.pack_into("<I", data, 32, len(data))
        struct.pack_into("<I", data, 104, len(data) - class_data)
        data[12:32] = hashlib.sha1(data[32:]).digest()
        struct.pack_into("<I", data, 8, zlib.adler32(data[12:]) & 0xffffffff)

    checksum()
    result = dex(bytes(data))
    assert "Lfixture/ActualClass;" in result["classes"] and "Lfixture/StringOnly;" not in result["classes"]
    tests += 1
    data[-2] ^= 1
    try:
        dex(bytes(data))
        raise AssertionError("Corrupt DEX integrity accepted")
    except ValueError:
        tests += 1
    for abi, (elf_class, machine) in ABI_ELF.items():
        header = bytearray(20)
        header[:6] = b"\x7fELF" + bytes([elf_class, 1])
        struct.pack_into("<H", header, 18, machine)
        assert elf_matches(header, abi)
        assert not any(elf_matches(header, other) for other in ABI_ELF if other != abi)
        tests += 1
    print(json.dumps({"selfTestsPassed": tests, "scope": "Argument and synthetic binary table parser checks only", "apkVerified": False}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apk", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--package-name", type=android_package_name, default=PACKAGE, help="Expected Android application ID; defaults to com.deqin.inout. Native class, resource, signature and ABI checks remain unchanged.")
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get("ANDROID_HOME", str(Path.home() / "AppData/Local/Android/Sdk"))))
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--required-abi", action="append", nargs="+", choices=sorted(ABI_ELF), help="Required native architectures; defaults to arm64-v8a. Space-separated or repeat this flag.")
    args = parser.parse_args()
    if args.self_test:
        require(args.apk is None and args.report is None, "Self-test cannot produce an APK verification report")
        self_test()
        return 0
    if args.apk is None or args.report is None:
        parser.error("--apk and --report are required")
    apk, report_path = args.apk.resolve(), args.report.resolve()
    required_abis = list(dict.fromkeys(abi for group in args.required_abi for abi in group)) if args.required_abi else ["arm64-v8a"]
    require(apk != report_path, "Report must not overwrite APK")
    report = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "staticApkVerified": False, "runtimeVerified": False,
              "scope": "OFFLINE_STATIC_APK_ONLY", "expected": {"package": args.package_name, "appId": APP_ID, "minSdk": 26, "targetSdk": 35, "requiredAbis": required_abis},
              "checks": [], "warnings": [], "limitations": [
                  "Does not install or launch this APK, execute UTS proxies, exercise AndroidKeyStore or test Android version/device behavior.",
                  "Does not connect to backend, MinIO, MQTT, PLC or printer, and does not prove physical printing.",
                  "Strict unobfuscated class profile: missing/renamed/optimized classes fail; mappings require separate review rather than a guessed pass.",
                  "DEX041 containers/compact DEX are rejected explicitly; parser inspects tables/definitions, not full bytecode correctness.",
                  "Signature verification proves cryptographic integrity with the included certificate; expected owner-certificate identity still requires independent fingerprint confirmation.",
              ]}
    try:
        require(apk.is_file() and apk.suffix.lower() == ".apk", "Provide an existing actual .apk file")
        verify(apk, args.sdk.resolve(), report, required_abis, args.package_name)
        report["staticApkVerified"] = bool(report["checks"]) and all(check["passed"] for check in report["checks"])
    except Exception as error:
        report["fatalError"] = str(error)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("APK static verification " + ("PASS" if report["staticApkVerified"] else "FAIL") + ": " + str(report_path))
    return 0 if report["staticApkVerified"] else 1


if __name__ == "__main__":
    sys.exit(main())
