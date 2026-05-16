import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小超过 10MB 限制' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';
    let warning: string | undefined;

    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      text = (data.text || '').trim();

      if (!text || text.length < 20) {
        warning = '这份简历未能提取到文本内容，可能为图片型 PDF。请复制文字粘贴到输入框。';
      }
    } catch {
      warning = 'PDF 解析失败，请复制文字粘贴到输入框。';
    }

    return NextResponse.json({ text, warning });
  } catch {
    return NextResponse.json(
      { error: '文件上传失败', text: '' },
      { status: 500 }
    );
  }
}
