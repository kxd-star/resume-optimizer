import { NextRequest, NextResponse } from 'next/server';
import { getResultByTaskId, updateResultMatch } from '@/lib/db';
import { parseResume } from '@/lib/resume-parser';
import { calculateMatch } from '@/lib/matcher';
import { validateUpdateMatchRequest } from '@/lib/validation';
import type { JDProfile, MatchResult, UpdateMatchResponse } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const validation = validateUpdateMatchRequest(body);

    if (!validation.valid || !validation.edited_resume_text) {
      return NextResponse.json(
        { error: '请求参数验证失败', details: validation.errors },
        { status: 400 }
      );
    }

    // Get existing result using taskId
    const existingResult = await getResultByTaskId(taskId);
    if (!existingResult) {
      return NextResponse.json({ error: '分析结果不存在' }, { status: 404 });
    }

    const oldMatchResult: MatchResult = JSON.parse(existingResult.match_result);
    const jdProfile: JDProfile = JSON.parse(existingResult.jd_profile);

    // Re-parse edited resume and re-calculate match
    const editedResumeProfile = await parseResume(validation.edited_resume_text);
    const newMatchResult = await calculateMatch(jdProfile, editedResumeProfile);

    // Save new match result
    await updateResultMatch(existingResult.id, JSON.stringify(newMatchResult));

    // Calculate changes
    const changedDimensions = newMatchResult.dimensions.map((newDim) => {
      const oldDim = oldMatchResult.dimensions.find((d) => d.key === newDim.key);
      return {
        key: newDim.key,
        old_score: oldDim?.score ?? 0,
        new_score: newDim.score,
        reason: newDim.explanation,
      };
    });

    const oldMatched = oldMatchResult.dimensions.flatMap((d) => d.matched_items);
    const newMatched = newMatchResult.dimensions.flatMap((d) => d.matched_items);
    const newKeywords = newMatched.filter((k) => !oldMatched.includes(k));
    const remainingMissing = newMatchResult.dimensions.flatMap((d) =>
      d.status !== 'matched' ? d.missing_items : []
    );

    const response: UpdateMatchResponse = {
      old_score: oldMatchResult.overall_score,
      new_score: newMatchResult.overall_score,
      delta: newMatchResult.overall_score - oldMatchResult.overall_score,
      changed_dimensions: changedDimensions,
      new_matched_keywords: newKeywords,
      remaining_missing_keywords: [...new Set(remainingMissing)],
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新匹配度失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
