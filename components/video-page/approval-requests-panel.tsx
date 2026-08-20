'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, RefreshCcw, ShieldX, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ApprovalRequest } from '@/components/video-page/types';

interface ApprovalRequestsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requests: ApprovalRequest[];
  currentUserId: string | null;
  canRequestApproval: boolean;
  onOpenApprovalRequest: () => void;
  isLoadingRequests: boolean;
  isSubmittingDecision: boolean;
  isCancelingRequest: boolean;
  error: string;
  onRefresh: () => void;
  onSubmitDecision: (
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string
  ) => Promise<boolean>;
  onCancelRequest: (requestId: string) => Promise<boolean>;
}

function statusBadge(status: ApprovalRequest['status']) {
  if (status === 'PENDING') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock3 className="h-3 w-3" />
        保留中
      </Badge>
    );
  }
  if (status === 'APPROVED') {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        承認済み
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        却下
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <ShieldX className="h-3 w-3" />
      取消
    </Badge>
  );
}

function decisionLabel(
  requestStatus: ApprovalRequest['status'],
  decisionStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
) {
  if (decisionStatus === 'APPROVED') return '承認済み';
  if (decisionStatus === 'REJECTED') return '却下';
  if (requestStatus === 'CANCELED') return '取消';
  return '保留中';
}

export function ApprovalRequestsPanel({
  open,
  onOpenChange,
  requests,
  currentUserId,
  canRequestApproval,
  onOpenApprovalRequest,
  isLoadingRequests,
  isSubmittingDecision,
  isCancelingRequest,
  error,
  onRefresh,
  onSubmitDecision,
  onCancelRequest,
}: ApprovalRequestsPanelProps) {
  const [decisionNote, setDecisionNote] = useState('');

  const pendingRequest = useMemo(
    () => requests.find((request) => request.status === 'PENDING') || null,
    [requests]
  );
  const myPendingDecision = useMemo(() => {
    if (!currentUserId || !pendingRequest) return null;
    return (
      pendingRequest.decisions.find(
        (decision) => decision.approverId === currentUserId && decision.status === 'PENDING'
      ) || null
    );
  }, [currentUserId, pendingRequest]);

  const canCancelPendingRequest =
    !!pendingRequest &&
    !!currentUserId &&
    (pendingRequest.requestedById === currentUserId || canRequestApproval);

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!pendingRequest) return;
    const success = await onSubmitDecision(
      pendingRequest.id,
      decision,
      decisionNote.trim() || undefined
    );
    if (success) {
      setDecisionNote('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader>
          <SheetTitle>承認</SheetTitle>
          <SheetDescription>
            依頼の履歴を確認し、保留中の承認に対応します。
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{requests.length}件の依頼</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenApprovalRequest}
                disabled={!canRequestApproval || !!pendingRequest}
              >
                承認を依頼
              </Button>
              <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isLoadingRequests}>
                {isLoadingRequests ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {pendingRequest && myPendingDecision ? (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">あなたの対応が必要です</p>
              <p className="text-xs text-muted-foreground">
                {pendingRequest.requestedBy.name || pendingRequest.requestedBy.email || 'ユーザー'}{' '}
                さんが承認を依頼しました。
              </p>
              <Textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="メモ（任意）"
                rows={3}
                maxLength={2000}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleDecision('APPROVED')}
                  disabled={isSubmittingDecision}
                >
                  {isSubmittingDecision ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  承認
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision('REJECTED')}
                  disabled={isSubmittingDecision}
                >
                  {isSubmittingDecision ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  却下
                </Button>
              </div>
            </div>
          ) : null}

          {pendingRequest && canCancelPendingRequest ? (
            <div className="rounded-md border p-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onCancelRequest(pendingRequest.id)}
                disabled={isCancelingRequest}
              >
                {isCancelingRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                保留中の依頼を取消
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                まだ承認依頼はありません。
              </p>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      依頼者:{' '}
                      {request.requestedBy.name || request.requestedBy.email || '不明'}
                    </p>
                    {statusBadge(request.status)}
                  </div>
                  {request.message ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {request.message}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {new Date(request.createdAt).toLocaleString()}
                  </p>
                  <div className="space-y-1">
                    {request.decisions.map((decision) => (
                      <div
                        key={decision.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">
                          {decision.approver.name || decision.approver.email || '不明'}
                        </span>
                        <span className="text-muted-foreground">
                          {decisionLabel(request.status, decision.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
