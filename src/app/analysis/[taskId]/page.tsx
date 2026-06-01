'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { AnalysisResult, TaskStatus } from '@/types';
import { ProgressStepLabels, ProgressStepPercent } from '@/types';
import ResultView from './ResultView';

type PageStatus = 'polling' | 'completed' | 'failed' | 'not_found';

interface TaskState {
  status: PageStatus;
  progressStep?: string;
  message?: string;
  result?: AnalysisResult;
  resultId?: string;
  error?: string;
}

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const [state, setState] = useState<TaskState>({ status: 'polling' });

  useEffect(() => {
    if (!taskId) return;

    // Check for pre-loaded result from synchronous analysis
    const preloaded = sessionStorage.getItem(`ar_${taskId}`);
    if (preloaded) {
      try {
        const result: AnalysisResult = JSON.parse(preloaded);
        sessionStorage.removeItem(`ar_${taskId}`);
        setState({
          status: 'completed',
          result,
          resultId: '',
          message: '分析完成',
        });
        saveToHistory(taskId, result);
        return;
      } catch {
        // Fall through to polling
      }
    }

    let cancelled = false;
    let pollCount = 0;

    const poll = async () => {
      while (!cancelled) {
        try {
          const resp = await fetch(`/api/analysis/${taskId}/status`);
          if (!resp.ok) {
            if (resp.status === 404) {
              setState({ status: 'not_found', error: '任务不存在' });
              return;
            }
            throw new Error(`HTTP ${resp.status}`);
          }

          const data = await resp.json();
          if (cancelled) return;

          if (data.status === 'completed') {
            setState({
              status: 'completed',
              result: data.result,
              resultId: data.result_id,
              message: '分析完成',
            });
            // Save to localStorage history
            saveToHistory(taskId, data.result);
            return;
          }

          if (data.status === 'failed') {
            setState({ status: 'failed', error: data.error || '分析失败' });
            return;
          }

          setState({
            status: 'polling',
            progressStep: data.progress_step,
            message: data.message,
          });

          pollCount++;
        } catch (err) {
          if (cancelled) return;
          pollCount++;
          if (pollCount > 30) {
            setState({ status: 'failed', error: '获取任务状态超时，请刷新页面重试' });
            return;
          }
        }

        // Wait before next poll (increasing interval)
        await new Promise((r) => setTimeout(r, Math.min(1000 + pollCount * 200, 3000)));
      }
    };

    poll();

    return () => { cancelled = true; };
  }, [taskId]);

  if (state.status === 'not_found') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium text-gray-900">任务不存在</h2>
          <p className="text-sm text-gray-500 mt-1">{state.error}</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-blue-600 hover:text-blue-800">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-3 text-red-500">!</div>
          <h2 className="text-lg font-medium text-gray-900">分析失败</h2>
          <p className="text-sm text-gray-500 mt-1">{state.error || '请稍后重试'}</p>
          <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            返回重试
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'completed' && state.result) {
    return (
      <ResultView
        result={state.result!}
        resultId={state.resultId || ''}
        taskId={taskId}
        onBack={() => router.push('/')}
      />
    );
  }

  // Polling state
  const step = state.progressStep || 'jd_parsing';
  const percent = ProgressStepPercent[step as keyof typeof ProgressStepPercent] || 0;
  const message = state.message || ProgressStepLabels[step as keyof typeof ProgressStepLabels] || '分析中...';

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm w-full px-4">
        <div className="mb-6">
          {/* Progress animation */}
          <div className="relative w-20 h-20 mx-auto mb-4">
            <svg className="w-20 h-20" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="4" />
              <circle
                cx="40" cy="40" r="34"
                fill="none" stroke="#3b82f6" strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - percent / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-blue-600">
              {percent}%
            </span>
          </div>
          <h2 className="text-lg font-medium text-gray-900">正在分析</h2>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-4">请勿关闭此页面，分析完成后将自动展示结果</p>
      </div>
    </div>
  );
}

function saveToHistory(taskId: string, result: AnalysisResult) {
  try {
    const key = 'resume_optimizer_history';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift({
      task_id: taskId,
      job_title: result.jd_profile.job_title,
      overall_score: result.match_result.overall_score,
      created_at: new Date().toISOString(),
    });
    // Keep last 20
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 20)));
  } catch {
    // Ignore localStorage errors
  }
}
