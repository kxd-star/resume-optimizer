import { v4 as uuidv4 } from 'uuid';
import { insertTask, insertResult, getTask, getResultByTaskId } from './db';
import { parseJD } from './jd-parser';
import { parseResume } from './resume-parser';
import { calculateMatch } from './matcher';
import { generateDiagnosis } from './diagnosis';
import { optimizeResume } from './optimizer';
import { generateInterviewQuestions } from './interview-generator';
import type {
  JDProfile,
  ResumeProfile,
  AnalysisResult,
  TaskStatus,
  ProgressStep,
  RewriteMode,
} from '@/types';

async function runAnalysis(
  taskId: string,
  params: {
    jd_text: string;
    resume_text: string;
    rewrite_mode?: string;
    question_count?: number;
  }
): Promise<{ result: AnalysisResult; resultId: string }> {
  const [jdProfile, resumeProfile] = await Promise.all([
    parseJD(params.jd_text) as Promise<JDProfile>,
    parseResume(params.resume_text) as Promise<ResumeProfile>,
  ]);

  const matchResult = await calculateMatch(jdProfile, resumeProfile);
  const diagnosis = await generateDiagnosis(jdProfile, resumeProfile, matchResult);
  const optimizedResume = await optimizeResume(
    params.resume_text,
    jdProfile,
    resumeProfile,
    matchResult,
    diagnosis,
    (params.rewrite_mode as RewriteMode) || 'standard'
  );
  const interviewQuestions = await generateInterviewQuestions(
    jdProfile,
    resumeProfile,
    matchResult,
    params.question_count || 8
  );

  const resultId = `result_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const result: AnalysisResult = {
    jd_profile: jdProfile,
    resume_profile: resumeProfile,
    match_result: matchResult,
    diagnosis,
    optimized_resume: optimizedResume,
    interview_questions: interviewQuestions,
  };

  // Best-effort DB save (works locally, may not persist on Vercel)
  try {
    await insertResult({
      id: resultId,
      task_id: taskId,
      jd_profile: JSON.stringify(jdProfile),
      resume_profile: JSON.stringify(resumeProfile),
      match_result: JSON.stringify(matchResult),
      diagnosis: JSON.stringify(diagnosis),
      optimized_resume: JSON.stringify(optimizedResume),
      interview_questions: JSON.stringify(interviewQuestions),
    });
  } catch (e) {
    console.warn('Failed to save result to DB (non-fatal):', e);
  }

  return { result, resultId };
}

export async function createAnalysisTask(params: {
  jd_text: string;
  resume_text: string;
  rewrite_mode?: RewriteMode;
  question_count?: number;
  client_session_id?: string;
}): Promise<{ taskId: string; result: AnalysisResult; resultId: string }> {
  const taskId = `task_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  try {
    await insertTask({
      id: taskId,
      client_session_id: params.client_session_id,
      jd_text: params.jd_text,
      resume_text: params.resume_text,
      rewrite_mode: params.rewrite_mode || 'standard',
      question_count: params.question_count || 8,
    });
  } catch (e) {
    console.warn('Failed to save task to DB (non-fatal):', e);
  }

  const { result, resultId } = await runAnalysis(taskId, params);
  return { taskId, result, resultId };
}

export async function getTaskStatus(taskId: string): Promise<{
  status: TaskStatus;
  progress_step?: ProgressStep;
  error?: string;
  result?: AnalysisResult;
  result_id?: string;
}> {
  const task = await getTask(taskId);
  if (!task) {
    return { status: 'pending', progress_step: 'jd_parsing', error: 'task not found' };
  }

  const s: {
    status: TaskStatus;
    progress_step?: ProgressStep;
    error?: string;
    result?: AnalysisResult;
    result_id?: string;
  } = {
    status: task.status as TaskStatus,
    progress_step: task.progress_step as ProgressStep,
    error: task.error_message || undefined,
  };

  if (task.status === 'completed') {
    const dbResult = await getResultByTaskId(taskId);
    if (dbResult) {
      s.result_id = dbResult.id;
      try {
        s.result = {
          jd_profile: JSON.parse(dbResult.jd_profile || '{}'),
          resume_profile: JSON.parse(dbResult.resume_profile || '{}'),
          match_result: JSON.parse(dbResult.match_result || '{}'),
          diagnosis: JSON.parse(dbResult.diagnosis || '{}'),
          optimized_resume: JSON.parse(dbResult.optimized_resume || '{}'),
          interview_questions: JSON.parse(dbResult.interview_questions || '{}'),
        };
      } catch {
        s.status = 'failed';
        s.error = '结果数据损坏';
      }
    }
  }

  return s;
}
