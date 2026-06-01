'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { RewriteMode } from '@/types';

const CLIENT_SESSION_KEY = 'resume_optimizer_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(CLIENT_SESSION_KEY);
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem(CLIENT_SESSION_KEY, id);
  }
  return id;
}

const MODES: { value: RewriteMode; label: string; desc: string }[] = [
  { value: 'conservative', label: '保守版', desc: '仅优化措辞' },
  { value: 'standard', label: '标准版', desc: '重组经历' },
  { value: 'aggressive', label: '冲刺版', desc: '强 JD 导向' },
];

// Dynamically import pdfjs-dist only in browser
let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfjs();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY = 0;
    for (const item of content.items) {
      const { str, transform } = item as any;
      if (lines.length > 0 && Math.abs(transform[5] - lastY) > 2) lines.push('\n');
      lines.push(str);
      lastY = transform[5];
    }
    pages.push(lines.join(''));
  }

  doc.destroy();
  return pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

export default function HomePage() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>('standard');
  const [questionCount, setQuestionCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [errors, setErrors] = useState<{ jd?: string; resume?: string; general?: string }>({});

  useEffect(() => { getSessionId(); }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingFile(true);
    setErrors((prev) => ({ ...prev, resume: undefined }));

    try {
      if (file.name.endsWith('.pdf')) {
        const text = await extractTextFromPdf(file);
        if (text && text.length >= 20) {
          setResumeText(text);
        } else {
          setErrors((prev) => ({ ...prev, resume: '未能从 PDF 提取到文本内容，可能为扫描件/图片型 PDF。请复制文字粘贴到输入框。' }));
        }
      } else if (file.name.endsWith('.docx')) {
        const text = await extractTextFromDocx(file);
        if (text && text.length >= 20) {
          setResumeText(text);
        } else {
          setErrors((prev) => ({ ...prev, resume: '未能从 Word 文档提取到文本内容。' }));
        }
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        setResumeText(await file.text());
      } else {
        setErrors((prev) => ({ ...prev, resume: '仅支持 PDF、Word（.docx）和 TXT 格式' }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, resume: '文件解析失败，请复制文字粘贴到输入框。' }));
    } finally {
      setParsingFile(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const newErrors: { jd?: string; resume?: string } = {};
    if (!jdText.trim() || jdText.trim().length < 20) newErrors.jd = '请输入完整的岗位描述（至少 20 个字符）';
    if (!resumeText.trim() || resumeText.trim().length < 20) newErrors.resume = '请输入完整的简历内容（至少 20 个字符）';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    setErrors({});

    try {
      const resp = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: jdText.trim(),
          resume_text: resumeText.trim(),
          rewrite_mode: rewriteMode,
          question_count: questionCount,
          client_session_id: getSessionId(),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '创建分析任务失败');

      // Store result in sessionStorage for the result page
      if (data.result) {
        try {
          sessionStorage.setItem(`ar_${data.task_id}`, JSON.stringify(data.result));
        } catch { /* sessionStorage may be full */ }
      }

      router.push(`/analysis/${data.task_id}`);
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : '请求失败，请稍后重试' });
      setLoading(false);
    }
  }, [jdText, resumeText, rewriteMode, questionCount, router]);

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">简历优化器</h1>
            <p className="text-sm text-gray-500">AI 简历优化与面试准备工具</p>
          </div>
          <a href="/history" className="text-sm text-blue-600 hover:text-blue-800">历史记录</a>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {errors.general && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.general}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <section>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">岗位描述（JD）</label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="粘贴目标岗位的 JD 内容..."
              rows={14}
              className={`w-full border rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.jd ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
            {errors.jd && <p className="mt-1 text-xs text-red-500">{errors.jd}</p>}
            <p className="mt-1 text-xs text-gray-400">粘贴完整的岗位职责和要求，越详细分析越准确</p>
          </section>

          <section>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">简历内容</label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="粘贴你的简历内容..."
              rows={14}
              className={`w-full border rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.resume ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
            {errors.resume && <p className="mt-1 text-xs text-red-500">{errors.resume}</p>}
            <div className="mt-1 flex items-center gap-2">
              <label className="text-xs text-blue-600 cursor-pointer hover:text-blue-800 disabled:text-blue-300">
                <span>{parsingFile ? '正在解析文件...' : '上传 PDF/Word/TXT'}</span>
                <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} className="hidden" disabled={parsingFile} />
              </label>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-400">支持粘贴或上传</span>
            </div>
          </section>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">优化强度</label>
              <div className="flex gap-2">
                {MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setRewriteMode(mode.value)}
                    className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                      rewriteMode === mode.value
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{mode.label}</div>
                    <div className="text-gray-400 mt-0.5">{mode.desc}</div>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">根据匹配度自动推荐优化强度</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">面试题数量</label>
              <input type="range" min={5} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full" />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5 题</span>
                <span className="text-blue-600 font-medium">{questionCount} 题</span>
                <span>20 题</span>
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium text-sm transition-colors"
              >
                {loading ? '正在创建任务...' : '开始分析'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { title: '匹配度评估', desc: '5 维度分析简历与 JD 的匹配程度' },
            { title: '简历优化', desc: '基于真实经历生成针对性优化建议' },
            { title: '面试押题', desc: '预测高概率面试问题与回答策略' },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-sm font-medium text-gray-800">{f.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
