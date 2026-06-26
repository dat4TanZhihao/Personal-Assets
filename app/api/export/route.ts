import { contextFromRequest, getWebBackend, jsonError } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const exported = await getWebBackend().exportData({ format: 'CSV' }, contextFromRequest(request));
    const content = [
      'file,content',
      ...exported.files.map((file) => `${escapeCsv(file.name)},${escapeCsv(file.content)}`)
    ].join('\n');
    return new Response(`${content}\n`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="personal-assets-export.csv"'
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
