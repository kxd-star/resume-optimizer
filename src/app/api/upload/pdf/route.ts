import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小超过 10MB 限制' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // For MVP, try basic text extraction
    // PDF files often have text that can be read from the raw buffer
    let text = '';
    let warning: string | undefined;

    try {
      // Simple PDF text extraction by looking for text between parentheses
      // and after Tj operators in the PDF stream
      const content = buffer.toString('latin1');
      const textMatches = content.match(/\(([^)]*)\)\s*Tj/g);
      if (textMatches) {
        text = textMatches
          .map((m) => {
            const inner = m.match(/\(([^)]*)\)/);
            return inner ? inner[1] : '';
          })
          .filter((s) => s.length > 1)
          .join(' ');
      }

      // Also try stream content
      if (!text || text.length < 50) {
        const streamMatches = content.match(/BT\s*([\s\S]*?)\s*ET/g);
        if (streamMatches) {
          const streamText = streamMatches
            .map((s) => {
              const parts = s.match(/\(([^)]*)\)/g);
              return parts ? parts.map((p) => p.slice(1, -1)).join(' ') : '';
            })
            .filter(Boolean)
            .join(' ');
          if (streamText.length > text.length) {
            text = streamText;
          }
        }
      }

      // Clean up encoding artifacts
      text = text.replace(/\\[0-9]{3}/g, ' ')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '')
                .replace(/\s+/g, ' ')
                .trim();

      if (!text || text.length < 50) {
        warning = '这份简历暂未检测到可提取的文本内容，可能为图片型 PDF。请复制文字粘贴到输入框。';
      }
    } catch {
      warning = 'PDF 解析失败，请复制文字粘贴到输入框。';
    }

    return NextResponse.json({ text, warning });
  } catch (error) {
    return NextResponse.json(
      { error: '文件上传失败', text: '' },
      { status: 500 }
    );
  }
}
