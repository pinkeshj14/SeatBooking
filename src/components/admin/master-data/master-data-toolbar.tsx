'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImportDialog } from '@/components/admin/master-data/import-dialog';
import { Download, Upload } from 'lucide-react';

export function MasterDataToolbar() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href="/admin/master-data/export">
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Import from Excel
      </Button>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
