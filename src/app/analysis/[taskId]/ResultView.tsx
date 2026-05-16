'use client';

import { useState } from 'react';
import type { AnalysisResult } from '@/types';
interface Props {
  result: AnalysisResult;
  resultId: string;
  taskId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'optimization' | 'interview' | 'export';

export default function ResultView({ result, resultId, taskId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: '优化概览' },
    { key: 'optimization', label: '简历优化' },
    { key: 'interview', label: '面试押题' },
    { key: 'export', label: '导出' },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; 返回</button>
          <h1 className="text-base font-medium text-gray-900">{result.jd_profile.job_title}</h1>
          <div className="w-12" />
        </div>
        {/* Score bar */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className={`text-2xl font-bold ${
              result.match_result.overall_score >= 75 ? 'text-green-600' :
              result.match_result.overall_score >= 45 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {result.match_result.overall_score}
              <span className="text-sm text-gray-400 font-normal">/100</span>
            </div>
            <div className="flex-1">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    result.match_result.overall_score >= 75 ? 'bg-green-500' :
                    result.match_result.overall_score >= 45 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${result.match_result.overall_score}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              推荐: {result.match_result.recommend_mode === 'conservative' ? '保守版' :
                     result.match_result.recommend_mode === 'standard' ? '标准版' : '冲刺版'}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{result.match_result.recommend_reason}</p>
        </div>
        {/* Tabs */}
        <div className="border-t border-gray-200">
          <div className="max-w-5xl mx-auto px-4 flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {activeTab === 'overview' && <OverviewTab result={result} />}
        {activeTab === 'optimization' && <OptimizationTab result={result} resultId={resultId} taskId={taskId} />}
        {activeTab === 'interview' && <InterviewTab result={result} />}
        {activeTab === 'export' && <ExportTab result={result} taskId={taskId} />}
      </main>
    </div>
  );
}

// ============ Overview Tab ============
function OverviewTab({ result }: { result: AnalysisResult }) {
  const { match_result, diagnosis } = result;

  return (
    <div className="space-y-6">
      {/* Dimensions */}
      <section>
        <h2 className="text-sm font-medium text-gray-900 mb-3">分维度评分</h2>
        <div className="space-y-3">
          {match_result.dimensions.map((dim) => (
            <div key={dim.key} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{dim.name}</span>
                  <DimStatusBadge status={dim.status} />
                </div>
                <span className={`text-lg font-bold ${
                  dim.score >= 75 ? 'text-green-600' : dim.score >= 45 ? 'text-yellow-600' : 'text-red-600'
                }`}>{dim.score}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{dim.explanation}</p>
              <div className="flex flex-wrap gap-1.5">
                {dim.matched_items.map((item) => (
                  <span key={item} className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs border border-green-200">
                    {item}
                  </span>
                ))}
                {dim.missing_items.map((item) => (
                  <span key={item} className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs border border-red-200">
                    -{item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Diagnosis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">诊断结果</h2>
          {diagnosis.risk_items.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-xs font-medium text-red-600">风险项</h3>
              {diagnosis.risk_items.map((item, i) => (
                <div key={i} className="p-2 bg-red-50 border border-red-100 rounded text-xs">
                  <p className="text-red-800 font-medium">{item.issue}</p>
                  <p className="text-red-600 mt-0.5">{item.suggestion}</p>
                </div>
              ))}
            </div>
          )}
          {diagnosis.matched.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-medium text-green-600 mb-1">已匹配</h3>
              <ul className="space-y-1">
                {diagnosis.matched.map((item, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diagnosis.missing.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-medium text-red-600 mb-1">缺失项</h3>
              <ul className="space-y-1">
                {diagnosis.missing.map((item, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-red-400 mt-0.5 shrink-0">&#10007;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diagnosis.partial.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-yellow-600 mb-1">部分匹配</h3>
              <ul className="space-y-1">
                {diagnosis.partial.map((item, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-yellow-400 mt-0.5 shrink-0">&#9679;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">JD 解析摘要</h2>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-gray-400">岗位:</span>
              <span className="ml-1 text-gray-700">{result.jd_profile.job_title}</span>
            </div>
            <div>
              <span className="text-gray-400">经验要求:</span>
              <span className="ml-1 text-gray-700">{result.jd_profile.experience_years} 年</span>
            </div>
            <div>
              <span className="text-gray-400">硬技能:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {result.jd_profile.required_skills.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-400">软性要求:</span>
              <span className="ml-1 text-gray-700">{result.jd_profile.soft_skills.join('、') || '无'}</span>
            </div>
            <div>
              <span className="text-gray-400">行业:</span>
              <span className="ml-1 text-gray-700">{result.jd_profile.industries.join('、') || '未指定'}</span>
            </div>
            <div>
              <span className="text-gray-400">面试关注点:</span>
              <span className="ml-1 text-gray-700">{result.jd_profile.interview_focus.join('、') || '—'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DimStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    matched: 'bg-green-50 text-green-700 border-green-200',
    partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    missing: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<string, string> = {
    matched: '已匹配',
    partial: '部分匹配',
    missing: '缺失',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${colors[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
}

// ============ Optimization Tab ============
function OptimizationTab({ result, resultId, taskId }: { result: AnalysisResult; resultId: string; taskId: string }) {
  const { optimized_resume } = result;
  const [editedText, setEditedText] = useState(optimized_resume.optimized_resume);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [matchUpdate, setMatchUpdate] = useState<{
    old_score: number;
    new_score: number;
    delta: number;
  } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleUpdateMatch = async () => {
    setUpdating(true);
    setUpdateError(null);
    setMatchUpdate(null);
    try {
      // Need the actual result ID from DB; for MVP, try the task-based approach
      const resp = await fetch(`/api/analysis/${taskId}/update-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_resume_text: editedText }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '更新失败');
      setMatchUpdate(data);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : '更新匹配度失败');
    } finally {
      setUpdating(false);
    }
  };

  // Find the actual result id from the analysis
  // Since we use task-based approach, we need to derive the result ID
  // In MVP, each task has exactly one result, and the result ID pattern is result_{uuid}
  // The API accepts any valid resultId

  return (
    <div className="space-y-4">
      {/* Mode indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
          {optimized_resume.version === 'conservative' ? '保守版' :
           optimized_resume.version === 'standard' ? '标准版' : '冲刺版'}
        </span>
        {optimized_resume.placeholders.length > 0 && (
          <span className="text-xs text-yellow-600">
            {optimized_resume.placeholders.length} 个占位符待确认
          </span>
        )}
      </div>

      {/* Edit/View toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          {isEditing ? '预览' : '编辑'}
        </button>
        {isEditing && (
          <button
            onClick={handleUpdateMatch}
            disabled={updating}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
          >
            {updating ? '更新中...' : '更新匹配度'}
          </button>
        )}
      </div>

      {/* Editor / Viewer */}
      {isEditing ? (
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full h-96 border border-gray-300 rounded-lg p-4 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-gray-800">
            {optimized_resume.optimized_resume}
          </pre>
        </div>
      )}

      {/* Match update result */}
      {matchUpdate && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-green-800">匹配度更新</span>
            <span className="text-sm text-gray-500">{matchUpdate.old_score} &rarr;</span>
            <span className="text-lg font-bold text-green-600">{matchUpdate.new_score}</span>
            <span className={`text-sm font-medium ${matchUpdate.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {matchUpdate.delta > 0 ? '+' : ''}{matchUpdate.delta}
            </span>
          </div>
        </div>
      )}

      {updateError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {updateError}
        </div>
      )}

      {/* Changes list */}
      {optimized_resume.changes.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-900 mb-3">修改明细</h2>
          <div className="space-y-3">
            {optimized_resume.changes.map((change, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">原文</div>
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2">{change.before}</div>
                <div className="text-xs text-gray-400 mb-1">优化后</div>
                <div className="text-sm text-gray-800 bg-blue-50 p-2 rounded mb-2">{change.after}</div>
                <p className="text-xs text-gray-500">{change.reason}</p>
                {change.needs_confirmation.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {change.needs_confirmation.map((item) => (
                      <span key={item} className="text-xs text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk warnings */}
      {optimized_resume.risk_warnings.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h3 className="text-xs font-medium text-red-700 mb-2">风险提示</h3>
          <ul className="space-y-1">
            {optimized_resume.risk_warnings.map((w, i) => (
              <li key={i} className="text-xs text-red-600">{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ============ Interview Tab ============
function InterviewTab({ result }: { result: AnalysisResult }) {
  const { interview_questions } = result;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExpanded(next);
  };

  if (!interview_questions.questions || interview_questions.questions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">暂无面试题数据</div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-gray-900">
        面试押题（{interview_questions.questions.length} 题）
      </h2>
      {interview_questions.questions.map((q, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleExpand(i)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{q.question}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    q.type === '项目深挖' || q.type === '压力追问' ? 'bg-orange-50 text-orange-700' :
                    q.type === '硬技能考察' ? 'bg-blue-50 text-blue-700' :
                    q.type === '经历空白' ? 'bg-red-50 text-red-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>{q.type}</span>
                  <DiffBadge label={q.difficulty} />
                  <RiskBadge level={q.risk_level} />
                </div>
              </div>
            </div>
            <span className="text-gray-400 text-lg ml-2">{expanded.has(i) ? '−' : '+'}</span>
          </button>
          {expanded.has(i) && (
            <div className="px-4 pb-4 pt-0 border-t border-gray-100">
              <div className="ml-9 space-y-2 text-xs text-gray-600">
                <p><strong className="text-gray-800">考察点:</strong> {q.evaluation_point}</p>
                <p><strong className="text-gray-800">回答思路:</strong> {q.answer_strategy}</p>
                {q.materials_to_prepare.length > 0 && (
                  <p><strong className="text-gray-800">建议准备:</strong> {q.materials_to_prepare.join('、')}</p>
                )}
                {q.pitfalls.length > 0 && (
                  <div>
                    <strong className="text-gray-800">注意事项:</strong>
                    <ul className="list-disc list-inside mt-0.5">
                      {q.pitfalls.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiffBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    easy: 'bg-green-50 text-green-700',
    medium: 'bg-yellow-50 text-yellow-700',
    hard: 'bg-red-50 text-red-700',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${colors[label] || 'bg-gray-50 text-gray-600'}`}>{label}</span>;
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: 'bg-gray-50 text-gray-600',
    medium: 'bg-yellow-50 text-yellow-700',
    high: 'bg-red-50 text-red-700',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${colors[level] || ''}`}>{level}</span>;
}

// ============ Export Tab ============
function ExportTab({ result, taskId }: { result: AnalysisResult; taskId: string }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (type: string) => {
    setExporting(type);
    setExportError(null);
    try {
      // TXT export → download directly
      if (type === 'resume_ats') {
        const resp = await fetch(`/api/analysis/${taskId}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        if (!resp.ok) {
          const data = await resp.json();
          throw new Error(data.error || '导出失败');
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.jd_profile.job_title}_简历_ATS.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // HTML export → open in new window with auto-print
      const resp = await fetch(`/api/analysis/${taskId}/export?print=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || '导出失败');
      }
      const html = await resp.text();
      const win = window.open('', '_blank');
      if (!win) {
        throw new Error('浏览器阻止了新窗口，请允许弹窗后重试');
      }
      win.document.write(html);
      win.document.close();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-gray-900 mb-3">导出文件</h2>

      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{exportError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          onClick={() => handleExport('resume_ats')}
          disabled={exporting !== null}
          className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="text-sm font-medium text-gray-900">ATS 友好版简历</div>
          <div className="text-xs text-gray-500 mt-1">纯文本格式，适用于 ATS 系统解析</div>
        </button>

        <button
          onClick={() => handleExport('resume_pretty')}
          disabled={exporting !== null}
          className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="text-sm font-medium text-gray-900">美化排版版简历 (PDF)</div>
          <div className="text-xs text-gray-500 mt-1">浏览器打印预览 → 另存为 PDF，支持中文</div>
        </button>

        <button
          onClick={() => handleExport('interview_questions_full')}
          disabled={exporting !== null}
          className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="text-sm font-medium text-gray-900">面试押题 - 完整备战版 (PDF)</div>
          <div className="text-xs text-gray-500 mt-1">含问题、考察点、回答思路，浏览器打印为 PDF</div>
        </button>

        <button
          onClick={() => handleExport('interview_questions_cheat')}
          disabled={exporting !== null}
          className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all disabled:opacity-50"
        >
          <div className="text-sm font-medium text-gray-900">面试押题 - 精简小抄版 (PDF)</div>
          <div className="text-xs text-gray-500 mt-1">仅问题与要点，A4 纸一页打完</div>
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700">
          点击后自动打开新窗口和打印预览，选择"另存为 PDF"即可保存。支持中文排版，A4 纸张。
        </p>
      </div>
    </div>
  );
}
