import { v4 as uuidv4 } from 'uuid';
import { insertTask, updateTaskStatus, insertResult, getTask, getResultByTaskId } from './db';
import { parseJD } from './jd-parser';
import { parseResume } from './resume-parser';
import { calculateMatch } from './matcher';
import { generateDiagnosis } from './diagnosis';
import { optimizeResume } from './optimizer';
import { generateInterviewQuestions } from './interview-generator';
import type {
  TaskStatus,
  ProgressStep,
  JDProfile,
  ResumeProfile,
  AnalysisResult,
  RewriteMode,
} from '@/types';

// In-memory task state
const taskStates = new Map<string, {
  status: TaskStatus;
  progress_step: ProgressStep;
  error?: string;
  result?: AnalysisResult;
  result_id?: string;
}>();

async function runAnalysis(
  taskId: string,
  params: {
    jd_text: string;
    resume_text: string;
    rewrite_mode?: string;
    question_count?: number;
  }
): Promise<void> {
  let jdProfile: JDProfile;
  let resumeProfile: ResumeProfile;

  try {
    // Step 1-2: Parse JD and Resume in parallel
    setTaskProgress(taskId, 'running', 'jd_parsing');
    const [jdResult, resumeResult] = await Promise.all([
      parseJD(params.jd_text),
      parseResume(params.resume_text),
    ]);
    jdProfile = jdResult;
    resumeProfile = resumeResult;

    // Step 3: Calculate match
    setTaskProgress(taskId, 'running', 'matching');
    const matchResult = await calculateMatch(jdProfile, resumeProfile);

    // Step 4: Generate diagnosis
    setTaskProgress(taskId, 'running', 'diagnosis');
    const diagnosis = await generateDiagnosis(jdProfile, resumeProfile, matchResult);

    // Step 5: Optimize resume
    setTaskProgress(taskId, 'running', 'optimization');
    const optimizedResume = await optimizeResume(
      params.resume_text,
      jdProfile,
      resumeProfile,
      matchResult,
      diagnosis,
      (params.rewrite_mode as RewriteMode) || 'standard'
    );

    // Step 6: Generate interview questions
    setTaskProgress(taskId, 'running', 'interview_questions');
    const interviewQuestions = await generateInterviewQuestions(
      jdProfile,
      resumeProfile,
      matchResult,
      params.question_count || 8
    );

    // Save result
    const resultId = `result_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
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

    const result: AnalysisResult = {
      jd_profile: jdProfile,
      resume_profile: resumeProfile,
      match_result: matchResult,
      diagnosis,
      optimized_resume: optimizedResume,
      interview_questions: interviewQuestions,
    };

    await updateTaskStatus(taskId, 'completed', 'done');
    setTaskState(taskId, {
      status: 'completed',
      progress_step: 'done',
      result,
      result_id: resultId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateTaskStatus(taskId, 'failed', 'failed', errorMessage);
    setTaskState(taskId, {
      status: 'failed',
      progress_step: 'failed',
      error: errorMessage,
    });
  }
}

function setTaskProgress(taskId: string, status: TaskStatus, step: ProgressStep): void {
  const existing = taskStates.get(taskId);
  taskStates.set(taskId, { ...existing, status, progress_step: step } as any);
}

function setTaskState(taskId: string, state: {
  status: TaskStatus;
  progress_step: ProgressStep;
  error?: string;
  result?: AnalysisResult;
  result_id?: string;
}): void {
  taskStates.set(taskId, state);
}

export async function createAnalysisTask(params: {
  jd_text: string;
  resume_text: string;
  rewrite_mode?: RewriteMode;
  question_count?: number;
  client_session_id?: string;
}): Promise<string> {
  const taskId = `task_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  await insertTask({
    id: taskId,
    client_session_id: params.client_session_id,
    jd_text: params.jd_text,
    resume_text: params.resume_text,
    rewrite_mode: params.rewrite_mode || 'standard',
    question_count: params.question_count || 8,
  });

  taskStates.set(taskId, {
    status: 'pending',
    progress_step: 'jd_parsing',
  });

  // Run analysis asynchronously (don't await)
  runAnalysis(taskId, {
    jd_text: params.jd_text,
    resume_text: params.resume_text,
    rewrite_mode: params.rewrite_mode,
    question_count: params.question_count,
  }).catch((err) => {
    console.error(`Task ${taskId} failed:`, err);
    taskStates.set(taskId, {
      status: 'failed',
      progress_step: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return taskId;
}

export function getTaskStatus(taskId: string): {
  status: TaskStatus;
  progress_step?: ProgressStep;
  error?: string;
  result?: AnalysisResult;
  result_id?: string;
} {
  // Return from in-memory state first (fast path)
  const state = taskStates.get(taskId);
  if (state) {
    return {
      status: state.status,
      progress_step: state.progress_step,
      error: state.error,
      result: state.result,
      result_id: state.result_id,
    };
  }

  // Fallback: check DB
  getTask(taskId).then((task) => {
    if (task) {
      taskStates.set(taskId, {
        status: task.status as TaskStatus,
        progress_step: task.progress_step as ProgressStep,
        error: task.error_message || undefined,
      });
    }
  });

  return { status: 'pending', progress_step: 'jd_parsing' };
}
