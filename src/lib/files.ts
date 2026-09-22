import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';

export type LocalFile = { name: string; size: number; bytes: ArrayBuffer };

export async function pickPdf(): Promise<LocalFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];

  const bytes = asset.file
    ? await asset.file.arrayBuffer()
    : await new File(asset.uri).arrayBuffer();
  return {
    name: asset.name ?? 'resume.pdf',
    size: asset.size ?? bytes.byteLength,
    bytes,
  };
}

export async function downloadPdf(url: string): Promise<LocalFile> {
  const dest = new File(Paths.cache, `resume-${Date.now()}.pdf`);
  const file = await File.downloadFileAsync(url, dest);
  const bytes = await file.arrayBuffer();
  const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'resume.pdf');
  return { name: name.endsWith('.pdf') ? name : `${name}.pdf`, size: bytes.byteLength, bytes };
}
