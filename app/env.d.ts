export {};

declare global {
  interface DesktopFile {
    name: string;
    path?: string;
    bytes: number[];
  }

  interface BundledSample {
    name: string;
    path: string;
  }

  interface Window {
    sirenDesktop?: {
      selectWavFile: () => Promise<DesktopFile | null>;
      listBundledSamples: () => Promise<BundledSample[]>;
      readBundledSample: (samplePath: string) => Promise<DesktopFile>;
      exportAnalysisJson: (defaultName: string, jsonText: string) => Promise<string | null>;
      showPath: (targetPath: string) => Promise<void>;
    };
  }
}
