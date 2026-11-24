import Foundation
import Security

public final class DeqinSessionKeychain: NSObject {
    private static var query: [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "com.deqin.inout") + ".session",
            kSecAttrAccount as String: "dq.token",
            kSecAttrSynchronizable as String: false
        ]
    }

    // Return an explicit result so the synchronous UTS bridge can propagate failure.
    private static func result(_ status: OSStatus, token: String = "") -> String {
        let value: [String: Any] = [
            "success": status == errSecSuccess,
            "token": token,
            "error": status == errSecSuccess ? "" : "KEYCHAIN_ERROR_\(status)"
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let text = String(data: data, encoding: .utf8) else {
            return "{\"success\":false,\"token\":\"\",\"error\":\"KEYCHAIN_RESULT_ENCODING_FAILED\"}"
        }
        return text
    }

    public static func readSession() -> String {
        var attributes = query
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &item)
        if status == errSecItemNotFound { return result(errSecSuccess) }
        guard status == errSecSuccess else { return result(status) }
        guard let data = item as? Data,
              let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            return result(errSecDecode)
        }
        return result(errSecSuccess, token: token)
    }

    public static func writeSession(_ token: String) -> String {
        guard !token.isEmpty, let data = token.data(using: .utf8) else {
            return result(errSecParam)
        }
        let changes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
        if status == errSecItemNotFound {
            var attributes = query
            for (key, value) in changes { attributes[key] = value }
            status = SecItemAdd(attributes as CFDictionary, nil)
            if status == errSecDuplicateItem {
                status = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
            }
        }
        return result(status)
    }

    public static func clearSession() -> String {
        let status = SecItemDelete(query as CFDictionary)
        return result(status == errSecItemNotFound ? errSecSuccess : status)
    }
}
