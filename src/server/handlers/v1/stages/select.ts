import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { isPublishedNow } from '@/lib/time';
import { getStageByNo } from '@/services/stage-master';

export function optionsStageSelect() {
  return optionsResponse();
}

export async function postStageSelect(stageNoRaw: string) {
  const stageNo = Number(stageNoRaw);

  if (!Number.isInteger(stageNo) || stageNo <= 0) {
    return jsonError('INVALID_STAGE_NO', 'stageNo must be a positive integer', 400);
  }

  try {
    const stage = await getStageByNo(stageNo);
    if (!stage) {
      return jsonOk({ canStart: false, reason: 'NOT_FOUND' as const });
    }

    if (!isPublishedNow(stage)) {
      return jsonOk({ canStart: false, reason: 'LOCKED' as const });
    }

    return jsonOk({
      canStart: true,
      note: 'NO_USER_PROGRESS_TABLE_YET',
    });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to select stage', 500);
  }
}
