import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useInvoices, useCreateInvoice, useInvoicePreview, useInvoice, useUpdateInvoiceStatus, useDeleteInvoice, useTemplates } from "@/hooks/use-invoices";
import { useSettings } from "@/hooks/use-settings";
import { useClients } from "@/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Plus, Download, FileText, CheckCircle, AlertCircle, Loader2, Trash2, Send, Mail, Eye, Pencil, Check, X } from "lucide-react";
import { DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/invoice-pdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function replaceEmailPlaceholders(
  template: string,
  data: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

export default function Invoices() {
  const { data: invoices, isLoading } = useInvoices();
  const { data: settings } = useSettings();
  const { data: clients } = useClients();
  const updateInvoiceStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const { toast } = useToast();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sendConfirmInvoice, setSendConfirmInvoice] = useState<any | null>(null);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [editingNumberId, setEditingNumberId] = useState<number | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState<string>("");

  const gmailStatusQuery = useQuery({
    queryKey: ['/api/gmail/status'],
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest('POST', `/api/invoices/${invoiceId}/send`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Invoice Sent", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setSendConfirmInvoice(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to send invoice", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const updateInvoiceNumberMutation = useMutation({
    mutationFn: async ({ id, invoiceNumber }: { id: number; invoiceNumber: string }) => {
      const response = await apiRequest('PATCH', `/api/invoices/${id}/number`, { invoiceNumber });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice number updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setEditingNumberId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update invoice number", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const handleDelete = (id: number) => {
    deleteInvoice.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    });
  };

  const getClientForInvoice = (clientId: number | null) => {
    if (!clientId || !clients) return null;
    return clients.find(c => c.id === clientId);
  };

  const startEditingNumber = (invoice: { id: number; invoiceNumber: string }) => {
    setEditingNumberId(invoice.id);
    setEditingNumberValue(invoice.invoiceNumber);
  };

  const cancelEditingNumber = () => {
    setEditingNumberId(null);
    setEditingNumberValue("");
  };

  const saveInvoiceNumber = () => {
    if (!editingNumberId || !editingNumberValue.trim()) return;
    updateInvoiceNumberMutation.mutate({ id: editingNumberId, invoiceNumber: editingNumberValue.trim() });
  };

  const filteredAndSortedInvoices = invoices
    ?.filter(inv => clientFilter === "all" || inv.clientId === parseInt(clientFilter))
    ?.sort((a, b) => {
      switch (sortBy) {
        case "date_asc": return new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
        case "date_desc": return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
        case "amount_high": return Number(b.total) - Number(a.total);
        case "amount_low": return Number(a.total) - Number(b.total);
        default: return 0;
      }
    });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 md:pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Invoices</h1>
          <p className="text-muted-foreground mt-1">Generate and manage your invoices.</p>
        </div>
        <Button onClick={() => setIsGenerateOpen(true)} className="rounded-xl shadow-lg shadow-primary/20">
          <Plus className="w-5 h-5 mr-2" />
          Create Invoice
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Client:</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[180px] rounded-xl" data-testid="select-client-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Sort:</Label>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] rounded-xl" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Date (Newest)</SelectItem>
              <SelectItem value="date_asc">Date (Oldest)</SelectItem>
              <SelectItem value="amount_high">Amount (High to Low)</SelectItem>
              <SelectItem value="amount_low">Amount (Low to High)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-sm text-muted-foreground">Invoice #</th>
                <th className="text-left px-6 py-4 font-semibold text-sm text-muted-foreground">Client</th>
                <th className="text-left px-6 py-4 font-semibold text-sm text-muted-foreground">Date</th>
                <th className="text-left px-6 py-4 font-semibold text-sm text-muted-foreground">Amount</th>
                <th className="text-left px-6 py-4 font-semibold text-sm text-muted-foreground">Status</th>
                <th className="text-right px-6 py-4 font-semibold text-sm text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-4">
                      <Skeleton className="h-8 w-full rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filteredAndSortedInvoices?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    {invoices?.length === 0 ? "No invoices generated yet." : "No invoices match the filter."}
                  </td>
                </tr>
              ) : (
                filteredAndSortedInvoices?.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      {editingNumberId === invoice.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingNumberValue}
                            onChange={(e) => setEditingNumberValue(e.target.value)}
                            className="h-7 w-28 font-mono text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInvoiceNumber();
                              if (e.key === 'Escape') cancelEditingNumber();
                            }}
                            data-testid={`input-invoice-number-${invoice.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-green-600 hover:text-green-700"
                            onClick={saveInvoiceNumber}
                            disabled={!editingNumberValue.trim() || updateInvoiceNumberMutation.isPending}
                            data-testid={`button-save-number-${invoice.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={cancelEditingNumber}
                            data-testid={`button-cancel-number-${invoice.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group/num">
                          <span className="font-medium font-mono text-sm">{invoice.invoiceNumber}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover/num:opacity-100 transition-opacity"
                            onClick={() => startEditingNumber(invoice)}
                            data-testid={`button-edit-number-${invoice.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">{invoice.client?.name}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{format(new Date(invoice.issueDate), "MMM d, yyyy")}</td>
                    <td className="px-6 py-4 font-semibold">{formatCurrency(Number(invoice.total))}</td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        invoice.status === "paid" ? "default" :
                        invoice.status === "sent" ? "secondary" : 
                        "outline"
                      } className={cn(
                        "rounded-md capitalize",
                        invoice.status === "paid" && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300",
                        invoice.status === "sent" && "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300",
                      )}>
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => setSendConfirmInvoice(invoice)}
                          data-testid={`button-send-${invoice.id}`}
                        >
                          <Send className="w-4 h-4 mr-1" />
                          {invoice.status === "sent" ? "Resend" : "Send"}
                        </Button>
                        <DownloadButton invoiceId={invoice.id} settings={settings!} />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteConfirmId(invoice.id)}
                          data-testid={`button-delete-${invoice.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <GenerateInvoiceDialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen} />

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone. Any work sessions linked to this invoice will become unbilled again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteInvoice.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteInvoice.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={sendConfirmInvoice !== null} onOpenChange={(open) => !open && setSendConfirmInvoice(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {sendConfirmInvoice?.status === "sent" ? "Resend Invoice" : "Send Invoice"}
            </DialogTitle>
            <DialogDescription>
              {sendConfirmInvoice?.status === "sent" && (
                <span className="text-amber-600 block mb-2">
                  This invoice was already sent. Are you sure you want to send it again?
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {!(gmailStatusQuery.data as any)?.connected ? (
            <div className="py-4 text-center bg-muted/30 rounded-xl">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="font-medium">Gmail not connected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Gmail is not configured. Run "npm run gmail:auth" and add the credentials to your .env to send invoices by email.
              </p>
              <a href="/settings" className="text-sm text-primary hover:underline mt-2 inline-block">
                Go to Settings
              </a>
            </div>
          ) : sendConfirmInvoice ? (
            <div className="space-y-4 py-2">
              {(() => {
                const client = getClientForInvoice(sendConfirmInvoice.clientId);
                const billingEmail = client?.billingEmail || client?.email;
                const businessName = settings?.businessName || 'BillFlow';
                
                if (!billingEmail) {
                  return (
                    <div className="py-4 text-center bg-destructive/10 rounded-xl">
                      <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                      <p className="font-medium text-destructive">Missing billing email</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Please add a billing email to the client before sending.
                      </p>
                    </div>
                  );
                }
                
                const subjectTemplate = settings?.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT;
                const bodyTemplate = settings?.emailBodyTemplate || DEFAULT_EMAIL_BODY;
                
                const templateData: Record<string, string> = {
                  business_name: businessName,
                  client_name: client?.name || '',
                  client_email: billingEmail,
                  invoice_number: sendConfirmInvoice.invoiceNumber,
                  invoice_amount: `$${parseFloat(sendConfirmInvoice.total).toFixed(2)}`,
                  invoice_date: format(new Date(sendConfirmInvoice.issueDate), 'dd/MM/yyyy'),
                  due_date: format(new Date(sendConfirmInvoice.dueDate), 'dd/MM/yyyy'),
                  start_date: '',
                  end_date: '',
                  abn: settings?.abn || '',
                  phone: '',
                };
                
                const previewSubject = replaceEmailPlaceholders(subjectTemplate, templateData);
                const previewBody = replaceEmailPlaceholders(bodyTemplate, templateData);
                const previewBodyLines = previewBody.split('\n').slice(0, 6).join('\n');
                
                return (
                  <>
                    <div className="bg-muted/30 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">To:</span>
                        <span className="font-medium">{billingEmail}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subject:</span>
                        <span className="font-medium">{previewSubject}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Attachment:</span>
                        <span className="font-medium">{sendConfirmInvoice.invoiceNumber}.pdf</span>
                      </div>
                    </div>
                    
                    <div className="bg-muted/20 p-3 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Email Preview</span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">
                        {previewBodyLines}
                        {previewBody.split('\n').length > 6 && '\n...'}
                      </pre>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => setSendConfirmInvoice(null)}
                        className="rounded-xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => sendInvoiceMutation.mutate(sendConfirmInvoice.id)}
                        disabled={sendInvoiceMutation.isPending}
                        className="rounded-xl"
                        data-testid="button-confirm-send"
                      >
                        {sendInvoiceMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Invoice
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                );
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DownloadButton({ invoiceId, settings }: { invoiceId: number, settings: any }) {
  const { data: invoiceFull, isLoading, error: fetchError, refetch } = useInvoice(invoiceId);

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" className="rounded-lg" disabled data-testid={`button-download-${invoiceId}-loading`}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        PDF
      </Button>
    );
  }

  if (fetchError || !invoiceFull) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className="rounded-lg text-destructive"
        onClick={() => refetch()}
        data-testid={`button-download-${invoiceId}-retry`}
      >
        <AlertCircle className="w-4 h-4 mr-2" />
        Retry
      </Button>
    );
  }

  // Blank rather than hardcoded personal details: an unsaved Settings page
  // should produce an obviously incomplete invoice, not someone else's bank
  // account. Fill these in under Settings.
  const safeSettings = settings || {
    businessName: '',
    abn: '',
    paymentMethod: 'Bank Transfer',
    accountName: '',
    bsb: '',
    accountNumber: ''
  };

  return (
    <PDFDownloadLink
      document={
        <InvoicePDF 
          invoice={invoiceFull} 
          client={invoiceFull.client || null} 
          items={invoiceFull.items || []} 
          settings={safeSettings} 
        />
      }
      fileName={`${invoiceFull.invoiceNumber || 'INV-0000'}.pdf`}
    >
      {({ loading }) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="rounded-lg" 
          disabled={loading}
          data-testid={`button-download-${invoiceId}`}
        >
          <Download className="w-4 h-4 mr-2" />
          {loading ? "..." : "PDF"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}


function GenerateInvoiceDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: clients } = useClients();
  const { data: templates } = useTemplates();
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [dates, setDates] = useState({ start: "", end: "" });
  const [dateError, setDateError] = useState("");
  const [groupByDay, setGroupByDay] = useState(false);
  const [groupingMode, setGroupingMode] = useState<string>("none");
  const [quantityMode, setQuantityMode] = useState<string>("hours");
  const [roundingIncrement, setRoundingIncrement] = useState<string>("");
  const [enableGst, setEnableGst] = useState(false);
  const [gstRate, setGstRate] = useState("10");
  const [discountType, setDiscountType] = useState<string>("");
  const [discountValue, setDiscountValue] = useState("");
  const [dueDate, setDueDate] = useState(() => format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("Thank you for your business!");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  const createInvoice = useCreateInvoice();

  const previewParams: any = {
    clientId: selectedClient!,
    startDate: dates.start,
    endDate: dates.end,
    groupByDay,
    groupingMode,
    quantityMode,
  };
  if (roundingIncrement && roundingIncrement !== "none") previewParams.roundingIncrement = parseFloat(roundingIncrement);
  if (enableGst) { previewParams.enableGst = true; previewParams.gstRate = parseFloat(gstRate) || 10; }
  if (discountType && discountType !== "none" && discountValue) { previewParams.discountType = discountType; previewParams.discountValue = parseFloat(discountValue) || 0; }

  const previewQuery = useInvoicePreview(
    previewParams,
    !!selectedClient && !!dates.start && !!dates.end && step === 2
  );

  const handleNext = () => {
    if (!dates.start || !dates.end) {
      setDateError("Both start and end dates are required");
      return;
    }
    setDateError("");
    setStep(2);
  };

  const handleGenerate = () => {
    if (!previewQuery.data || !selectedClient) return;

    const createData: any = {
      clientId: selectedClient,
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate,
      items: previewQuery.data.lineItems,
      notes,
    };
    if (enableGst) { createData.taxRate = parseFloat(gstRate) || 10; createData.taxAmount = previewQuery.data.taxCents / 100; }
    if (discountType && discountType !== "none" && discountValue) { createData.discountAmount = previewQuery.data.discountCents / 100; }
    if (selectedTemplateId) { createData.templateId = parseInt(selectedTemplateId); }

    createInvoice.mutate(createData, {
      onSuccess: () => {
        onOpenChange(false);
        setStep(1);
        setSelectedClient(null);
        setDates({ start: "", end: "" });
        setGroupingMode("none");
        setQuantityMode("hours");
        setRoundingIncrement("");
        setEnableGst(false);
        setDiscountType("");
        setDiscountValue("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">Generate Invoice - Step {step} of 2</DialogTitle>
          <DialogDescription>
            {step === 1 ? "Configure invoice options and select sessions." : "Review the invoice before generating."}
          </DialogDescription>
        </DialogHeader>
        
        {step === 1 ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Client</Label>
              <Select onValueChange={(val) => setSelectedClient(parseInt(val))} value={selectedClient?.toString() || ""}>
                <SelectTrigger className="rounded-xl" data-testid="select-client">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <Input 
                  type="date" 
                  className="rounded-xl" 
                  value={dates.start}
                  onChange={(e) => { setDates(prev => ({ ...prev, start: e.target.value })); setDateError(""); }}
                  data-testid="input-start-date"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-destructive">*</span></Label>
                <Input 
                  type="date" 
                  className="rounded-xl" 
                  value={dates.end}
                  onChange={(e) => { setDates(prev => ({ ...prev, end: e.target.value })); setDateError(""); }}
                  data-testid="input-end-date"
                  required
                />
              </div>
            </div>
            {dateError && <p className="text-sm text-destructive" data-testid="text-date-error">{dateError}</p>}

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input 
                type="date" 
                className="rounded-xl" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="input-due-date"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grouping</Label>
                <Select value={groupingMode} onValueChange={(val) => { setGroupingMode(val); setGroupByDay(val === "day"); }}>
                  <SelectTrigger className="rounded-xl" data-testid="select-grouping">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No grouping</SelectItem>
                    <SelectItem value="day">By day</SelectItem>
                    <SelectItem value="rate_type">By rate type</SelectItem>
                    <SelectItem value="condensed">Condensed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Select value={quantityMode} onValueChange={setQuantityMode}>
                  <SelectTrigger className="rounded-xl" data-testid="select-quantity-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="sessions">Sessions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {quantityMode === "hours" && (
              <div className="space-y-2">
                <Label>Rounding (optional)</Label>
                <Select value={roundingIncrement} onValueChange={setRoundingIncrement}>
                  <SelectTrigger className="rounded-xl" data-testid="select-rounding">
                    <SelectValue placeholder="No rounding" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rounding</SelectItem>
                    <SelectItem value="0.25">15 min (0.25 hr)</SelectItem>
                    <SelectItem value="0.5">30 min (0.5 hr)</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="gst" checked={enableGst} onCheckedChange={(c) => setEnableGst(!!c)} data-testid="checkbox-gst" />
                <Label htmlFor="gst" className="font-normal cursor-pointer">Add GST (tax)</Label>
              </div>
              {enableGst && (
                <div className="ml-6 space-y-2">
                  <Label>GST Rate (%)</Label>
                  <Input 
                    type="number" 
                    className="rounded-xl w-24" 
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    data-testid="input-gst-rate"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Discount (optional)</Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={setDiscountType}>
                    <SelectTrigger className="rounded-xl w-[140px]" data-testid="select-discount-type">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed ($)</SelectItem>
                    </SelectContent>
                  </Select>
                  {discountType && discountType !== "none" && (
                    <Input
                      type="number"
                      className="rounded-xl flex-1"
                      placeholder={discountType === "percent" ? "10" : "50.00"}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      data-testid="input-discount-value"
                    />
                  )}
                </div>
              </div>
            </div>

            {templates && templates.length > 0 && (
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="rounded-xl" data-testid="select-template">
                    <SelectValue placeholder="Default template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name} {t.isDefault ? "(Default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                className="rounded-xl"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thank you for your business!"
                data-testid="input-notes"
              />
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-4">
            {previewQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-32 w-full rounded-xl mt-4" />
              </div>
            ) : previewQuery.error ? (
              <div className="text-center py-8 text-destructive bg-destructive/10 rounded-xl">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p>{(previewQuery.error as Error).message}</p>
              </div>
            ) : (
              <div className="bg-muted/30 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-12 font-bold border-b border-border pb-2 text-sm gap-2">
                  <span className="col-span-5">Description</span>
                  <span className="col-span-2 text-right">Qty</span>
                  <span className="col-span-2 text-right">Rate</span>
                  <span className="col-span-3 text-right">Amount</span>
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                  {previewQuery.data?.lineItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 text-sm gap-2">
                      <span className="col-span-5 truncate" title={item.description}>{item.description}</span>
                      <span className="col-span-2 text-right font-mono">{item.quantity}</span>
                      <span className="col-span-2 text-right font-mono">{formatCurrency(item.unitPrice)}</span>
                      <span className="col-span-3 text-right font-mono">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{formatCurrency(previewQuery.data?.subtotal || 0)}</span>
                  </div>
                  {(previewQuery.data?.discountCents ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span className="font-mono">-{formatCurrency(previewQuery.data!.discountCents / 100)}</span>
                    </div>
                  )}
                  {(previewQuery.data?.taxCents ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GST ({gstRate}%)</span>
                      <span className="font-mono">+{formatCurrency(previewQuery.data!.taxCents / 100)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-1">
                    <span>Total</span>
                    <span className="text-primary" data-testid="text-total">{formatCurrency(previewQuery.data?.total || 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <Button onClick={handleNext} disabled={!selectedClient || !dates.start || !dates.end} className="rounded-xl w-full" data-testid="button-preview">
              Preview Invoice
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl flex-1" data-testid="button-back">Back</Button>
              <Button 
                onClick={handleGenerate} 
                disabled={createInvoice.isPending || !previewQuery.data} 
                className="rounded-xl flex-1"
                data-testid="button-generate"
              >
                {createInvoice.isPending ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
