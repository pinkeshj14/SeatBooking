'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseMasterDataFileAction, type ParsedImportResult } from '@/app/actions/master-data-import';
import { bulkUpsertUsersAction, type BulkUserRow, type BulkRowResult as UserRowResult } from '@/app/actions/admin-users';
import { bulkUpsertSeatsAction, type BulkSeatRow, type BulkRowResult as SeatRowResult } from '@/app/actions/admin-seats';
import { Upload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'preview' | 'results';

export function ImportDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [parsing, startParsing] = useTransition();
  const [applying, startApplying] = useTransition();
  const [parsed, setParsed] = useState<ParsedImportResult | null>(null);
  const [userResults, setUserResults] = useState<UserRowResult[]>([]);
  const [seatResults, setSeatResults] = useState<SeatRowResult[]>([]);

  function reset() {
    setStep('upload');
    setParsed(null);
    setUserResults([]);
    setSeatResults([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleFileSelected(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    startParsing(async () => {
      const result = await parseMasterDataFileAction(formData);
      if (result.parseError) {
        toast.error(result.parseError);
        return;
      }
      setParsed(result);
      setStep('preview');
    });
  }

  function handleApply() {
    if (!parsed) return;
    startApplying(async () => {
      const userRows: BulkUserRow[] = parsed.userRows.map((r) => ({
        rowNumber: r.rowNumber,
        userId: r.userId,
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        defaultLocationId: r.defaultLocationId,
        defaultSeatId: r.defaultSeatId,
        isActive: r.isActive,
      }));
      const seatRows: BulkSeatRow[] = parsed.seatRows.map((r) => ({
        rowNumber: r.rowNumber,
        id: r.id,
        locationId: r.locationId,
        seatNumber: r.seatNumber,
        rowIdx: r.rowIdx,
        colIdx: r.colIdx,
        isActive: r.isActive,
      }));

      const [uRes, sRes] = await Promise.all([
        userRows.length ? bulkUpsertUsersAction(userRows) : Promise.resolve([]),
        seatRows.length ? bulkUpsertSeatsAction(seatRows) : Promise.resolve([]),
      ]);
      setUserResults(uRes);
      setSeatResults(sRes);
      setStep('results');
      router.refresh();
    });
  }

  const totalIssues = (parsed?.userIssues.length ?? 0) + (parsed?.seatIssues.length ?? 0);
  const totalValid = (parsed?.userRows.length ?? 0) + (parsed?.seatRows.length ?? 0);
  const totalFailed = [...userResults, ...seatResults].filter((r) => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Excel</DialogTitle>
          <DialogDescription>
            Upload the workbook exported from this page — same headers, same two sheets (Users, Seats).
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-sm text-muted-foreground hover:bg-muted/40">
            {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span>{parsing ? 'Reading file…' : 'Click to choose the .xlsx file, or drag one here'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={parsing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
          </label>
        )}

        {step === 'preview' && parsed && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {totalValid} row(s) ready to apply
              </Badge>
              {totalIssues > 0 && (
                <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  {totalIssues} row(s) with errors — these will be skipped
                </Badge>
              )}
            </div>

            {totalIssues > 0 && (
              <ScrollArea className="h-56 rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Sheet</TableHead>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead className="w-32">Field</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...parsed.userIssues, ...parsed.seatIssues].map((issue, i) => (
                      <TableRow key={i}>
                        <TableCell>{issue.sheet}</TableCell>
                        <TableCell>{issue.row}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{issue.field ?? '—'}</TableCell>
                        <TableCell className="text-sm">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {totalValid === 0 && (
              <Alert variant="destructive">
                <AlertDescription>No valid rows to apply. Fix the errors above and re-upload.</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {userResults.length + seatResults.length - totalFailed} applied
              </Badge>
              {totalFailed > 0 && (
                <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  {totalFailed} failed
                </Badge>
              )}
            </div>
            <ScrollArea className="h-72 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Sheet</TableHead>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Identifier</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userResults.map((r) => (
                    <TableRow key={`u-${r.rowNumber}`}>
                      <TableCell>Users</TableCell>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell className="text-xs">{r.email}</TableCell>
                      <TableCell className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {r.success ? `${r.action}` : r.error}
                      </TableCell>
                    </TableRow>
                  ))}
                  {seatResults.map((r) => (
                    <TableRow key={`s-${r.rowNumber}`}>
                      <TableCell>Seats</TableCell>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell className="text-xs">{r.seatNumber}</TableCell>
                      <TableCell className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {r.success ? `${r.action}` : r.error}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset}>
                Choose a different file
              </Button>
              <Button onClick={handleApply} disabled={applying || totalValid === 0}>
                {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply {totalValid} valid row(s)
              </Button>
            </>
          )}
          {step === 'results' && <Button onClick={() => handleOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
