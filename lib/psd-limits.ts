// Source-file size and decoded pixels are separate budgets: embedded smart-object
// sources may be large even when the saved layer pixels are small.
export const PSD_LIMITS=Object.freeze({fileBytes:2_000_000_000,pixels:33_177_600,decodedBytes:1_000_000_000,assetBytes:10_000_000,totalAssetBytes:55_000_000,layers:250,depth:20});
export const PSD_FILE_LIMIT_LABEL='2 GB';
export const PSD_DECODED_LIMIT_LABEL='1 GB';

export function psdImportError(error:unknown,fallback='PSD import failed.'){
 const message=error instanceof Error?error.message:fallback;
 return message.replace(/^Error invoking remote method ['"]broadcastcg:(?:preparePsd|commitPsd)['"]:\s*(?:Error:\s*)?/, '');
}
