declare module "~/utils/autotrack";

declare module "vite/modulepreload-polyfill";

declare module "string-replace-to-array";

declare module "command-score";

declare module "*.css?raw" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const value: any;
  export = value;
}
