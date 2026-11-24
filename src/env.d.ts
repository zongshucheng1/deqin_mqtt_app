/// <reference types="vite/client" />
declare const __DEQIN_DEPLOYMENT__: Readonly<import("./domain/deployment").DeploymentConfig>;
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}
declare module "@/uni_modules/deqin-host" {
  export function openExternalMirror(): Promise<boolean>;
  export function configureFromServer(
    apiUrl: string,
    sessionToken: string,
    hostId: string,
    factoryId: string,
    clientId: string,
  ): Promise<string>;
  export function startHost(): string;
  export function stopHost(): string;
  export function getHostStatus(): string;
  export function getSessionToken(): string;
  export function setSessionToken(token: string): string;
  export function clearSessionToken(): string;
  export function requestHostPermissions(): Promise<string>;
  export function clearHostCredentials(): void;
  export function probePrinter(
    endpointUri: string,
    paperWidthMm: number,
    paperHeightMm: number,
  ): Promise<string>;
  export function testPrinter(requestJson: string): Promise<string>;
  export function printDeviceLabel(apiUrl:string,clientId:string,requestJson:string):Promise<string>;
  export function getPrintDeviceId():string;
  export function startDevicePrinting(apiUrl:string,clientId:string,configurationJson:string):string;
  export function stopDevicePrinting():string;
  export function getPrinterTest(requestKey: string): Promise<string>;
  export function startPrinterDiscovery(timeoutMs: number): string;
  export function startUsbPrinterDiscovery(): string;
  export function getPrinterDiscovery(scanId: string): string;
  export function cancelPrinterDiscovery(scanId: string): string;
  export function probeDiscoveredPrinter(scanId: string, candidateId: string, paperWidthMm: number, paperHeightMm: number): Promise<string>;
}
