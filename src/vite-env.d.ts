/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RETAIL_BI_API_BASE_URL?: string;
  readonly VITE_RETAIL_DATA_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
