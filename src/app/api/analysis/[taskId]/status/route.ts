import { NextRequest, NextResponse } from 'next/server';
import { getTaskStatus } from '@/lib/task-manager';
import { ProgressStepLabels, ProgressStepPercent } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const status = getTaskStatus(taskId);

    if (!status || status.status === 'failed' && status.error?.includes('not found')) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      task_id: taskId,
      status: status.status,
      progress_step: status.progress_step,
      progress_percent: status.progress_step ? ProgressStepPercent[status.progress_step] : 0,
      message: status.progress_step ? ProgressStepLabels[status.progress_step] : undefined,
      result: status.status === 'completed' ? status.result : undefined,
      result_id: status.status === 'completed' ? status.result_id : undefined,
      error: status.status === 'failed' ? status.error : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取任务状态失败' },
      { status: 500 }
    );
  }
}
