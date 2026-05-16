'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface HistoryRecord {
  task_id: string;
  job_title: string;
  overall_score: number;
  created_at: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('resume_optimizer_history') || '[]');
      setRecords(data);
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('resume_optimizer_history');
    setRecords([]);
  };

  const viewResult = (taskId: string) => {
    router.push(`/analysis/${taskId}`);
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-green-600';
    if (score >= 45) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-700">
              &larr; 返回
            </button>
            <h1 className="text-lg font-bold text-gray-900">历史记录</h1>
          </div>
          {records.length > 0 && (
            <button onClick={clearHistory} className="text-sm text-red-500 hover:text-red-700">
              清空记录
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        {!loaded ? (
          <div className="text-center py-12 text-sm text-gray-400">加载中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl text-gray-300 mb-3">~</div>
            <p className="text-sm text-gray-500">暂无历史记录</p>
            <button onClick={() => router.push('/')} className="mt-3 text-sm text-blue-600 hover:text-blue-800">
              开始第一次分析
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <button
                key={record.task_id}
                onClick={() => viewResult(record.task_id)}
                className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {record.job_title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {record.created_at
                        ? new Date(record.created_at).toLocaleString('zh-CN')
                        : '未知时间'}
                    </div>
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    <div className={`text-lg font-bold ${scoreColor(record.overall_score)}`}>
                      {record.overall_score}
                    </div>
                    <div className="text-xs text-gray-400">匹配度</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
