import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useTemplates, useCreateTemplate, useDeleteTemplate, useSetDefaultTemplate, useUploadTemplateFile, useUpdateTemplate } from "@/hooks/use-invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvoiceSettingsSchema, type InsertInvoiceSettings, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY, type FieldMapping } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, CheckCircle, AlertCircle, RotateCcw, Upload, Trash2, Star, Plus, GripVertical, X, FileImage } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  
  const gmailStatusQuery = useQuery({
    queryKey: ['/api/gmail/status'],
  });

  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);

  const form = useForm<InsertInvoiceSettings>({
    resolver: zodResolver(insertInvoiceSettingsSchema),
    defaultValues: {
      businessName: "",
      businessEmail: "",
      invoicePrefix: "INV-",
      defaultJuniorRate: "25.00",
      defaultSeniorRate: "30.00",
      abn: "",
      accountName: "",
      bsb: "",
      accountNumber: "",
      paymentMethod: "Bank Transfer",
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        businessName: settings.businessName || "",
        businessEmail: settings.businessEmail || "",
        invoicePrefix: settings.invoicePrefix || "INV-",
        defaultJuniorRate: settings.defaultJuniorRate?.toString() || "25.00",
        defaultSeniorRate: settings.defaultSeniorRate?.toString() || "30.00",
        abn: settings.abn || "",
        accountName: settings.accountName || "",
        bsb: settings.bsb || "",
        accountNumber: settings.accountNumber || "",
        paymentMethod: settings.paymentMethod || "Bank Transfer",
      });
      setEmailSubject(settings.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT);
      setEmailBody(settings.emailBodyTemplate || DEFAULT_EMAIL_BODY);
    }
  }, [settings, form]);

  const resetEmailTemplates = () => {
    setEmailSubject(DEFAULT_EMAIL_SUBJECT);
    setEmailBody(DEFAULT_EMAIL_BODY);
  };

  const onSubmit = (data: InsertInvoiceSettings) => {
    updateSettings.mutate({
      ...data,
      emailSubjectTemplate: emailSubject,
      emailBodyTemplate: emailBody,
    });
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-[500px] w-full max-w-2xl rounded-2xl" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 md:pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-display">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your business details and invoice preferences.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>These details will appear on your invoices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="Acme Corp" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Email</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="billing@acme.com" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="abn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ABN</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="12 345 678 901" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Connection
              </CardTitle>
              <CardDescription>Connect your Google account to send invoices via email.</CardDescription>
            </CardHeader>
            <CardContent>
              {gmailStatusQuery.isLoading ? (
                <Skeleton className="h-12 w-full rounded-xl" />
              ) : (gmailStatusQuery.data as any)?.connected ? (
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-300">Connected</p>
                      <p className="text-sm text-muted-foreground">
                        {(gmailStatusQuery.data as any)?.email || "Ready to send invoices via Gmail"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Not connected</p>
                      <p className="text-sm text-muted-foreground">Run <code className="font-mono text-xs">npm run gmail:auth</code> and add the token to your <code className="font-mono text-xs">.env</code></p>
                    </div>
                  </div>
                </div>
              )}
              
              {(gmailStatusQuery.data as any)?.connected && (
                <div className="mt-4 space-y-4">
                  <Separator />
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Email Template</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetEmailTemplates}
                      data-testid="button-reset-email-template"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset to default
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="email-subject" className="text-sm font-medium">Subject Template</Label>
                      <Input
                        id="email-subject"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="rounded-xl mt-1"
                        placeholder="Invoice {invoice_number} from {business_name}"
                        data-testid="input-email-subject"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="email-body" className="text-sm font-medium">Body Template</Label>
                      <Textarea
                        id="email-body"
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="rounded-xl mt-1 min-h-[200px] font-mono text-sm"
                        placeholder="Dear {client_name},..."
                        data-testid="input-email-body"
                      />
                    </div>
                    
                    <div className="bg-muted/30 p-3 rounded-xl">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Available placeholders:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          '{business_name}',
                          '{client_name}',
                          '{client_email}',
                          '{invoice_number}',
                          '{invoice_amount}',
                          '{invoice_date}',
                          '{due_date}',
                          '{start_date}',
                          '{end_date}',
                          '{abn}',
                          '{phone}'
                        ].map((placeholder) => (
                          <code key={placeholder} className="bg-background px-1.5 py-0.5 rounded text-xs">
                            {placeholder}
                          </code>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>Your bank account details for invoice payments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="accountName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="Account holder name" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bsb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BSB</FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-xl" placeholder="000-000" value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-xl" placeholder="123456" value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="Bank Transfer" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Rates & Defaults</CardTitle>
              <CardDescription>Set your standard billing rates and preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultJuniorRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Junior Rate ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} className="rounded-xl" value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultSeniorRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senior Rate ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} className="rounded-xl" value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="invoicePrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Prefix</FormLabel>
                    <FormControl>
                      <Input {...field} className="rounded-xl" placeholder="INV-" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={updateSettings.isPending} className="rounded-xl min-w-[120px]">
              {updateSettings.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>

      <Separator className="my-8" />
      <TemplateManager />
    </div>
  );
}

const FIELD_TYPE_OPTIONS = [
  { value: "invoice_number", label: "Invoice Number" },
  { value: "invoice_date", label: "Invoice Date" },
  { value: "due_date", label: "Due Date" },
  { value: "client_name", label: "Client Name" },
  { value: "client_email", label: "Client Email" },
  { value: "client_address", label: "Client Address" },
  { value: "business_name", label: "Business Name" },
  { value: "business_email", label: "Business Email" },
  { value: "abn", label: "ABN" },
  { value: "subtotal", label: "Subtotal" },
  { value: "tax", label: "Tax (GST)" },
  { value: "discount", label: "Discount" },
  { value: "total", label: "Total" },
  { value: "notes", label: "Notes" },
  { value: "payment_details", label: "Payment Details" },
  { value: "line_items_table", label: "Line Items Table" },
  { value: "custom", label: "Custom Text" },
];

function TemplateManager() {
  const { data: templates, isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const setDefault = useSetDefaultTemplate();
  const uploadFile = useUploadTemplateFile();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [mapperTemplateId, setMapperTemplateId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateTemplate = async () => {
    if (!newName.trim()) return;
    
    let fileUrl: string | undefined;
    if (uploadingFile) {
      const result = await uploadFile.mutateAsync(uploadingFile);
      fileUrl = result.url;
    }

    createTemplate.mutate({
      name: newName.trim(),
      type: fileUrl ? "custom" : "standard",
      uploadedFileUrl: fileUrl,
    }, {
      onSuccess: () => {
        setShowCreate(false);
        setNewName("");
        setUploadingFile(null);
      }
    });
  };

  const activeMapperTemplate = templates?.find(t => t.id === mapperTemplateId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Invoice Templates</h2>
          <p className="text-muted-foreground mt-1">Manage your custom invoice templates with field mapping.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="rounded-xl" data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="space-y-3">
          {templates.map(template => (
            <Card key={template.id} className="rounded-xl border-border/50 shadow-sm">
              <CardContent className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileImage className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{template.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">{template.type}</Badge>
                      {template.isDefault && <Badge className="text-xs">Default</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {template.uploadedFileUrl ? "Custom background uploaded" : "Standard template"}
                      {template.fieldMappings ? ` - ${(template.fieldMappings as FieldMapping[]).length} fields mapped` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {template.type === "custom" && template.uploadedFileUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMapperTemplateId(template.id)}
                      className="rounded-lg text-sm"
                      data-testid={`button-map-fields-${template.id}`}
                    >
                      Map Fields
                    </Button>
                  )}
                  {!template.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDefault.mutate(template.id)}
                      title="Set as default"
                      data-testid={`button-set-default-${template.id}`}
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTemplate.mutate(template.id)}
                    className="text-destructive"
                    data-testid={`button-delete-template-${template.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileImage className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No templates created yet.</p>
            <p className="text-sm mt-1">Create a template to customize your invoice layout.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Create a new invoice template. Optionally upload a background image to map fields onto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                className="rounded-xl"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Custom Invoice"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Background Image (optional)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-bg"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingFile ? uploadingFile.name : "Choose File"}
                </Button>
                {uploadingFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setUploadingFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setUploadingFile(f);
                }}
              />
              <p className="text-xs text-muted-foreground">Supported: PNG, JPG, PDF (max 10MB)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={!newName.trim() || createTemplate.isPending || uploadFile.isPending}
              className="rounded-xl"
              data-testid="button-save-template"
            >
              {(createTemplate.isPending || uploadFile.isPending) ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeMapperTemplate && (
        <FieldMapper
          template={activeMapperTemplate}
          onClose={() => setMapperTemplateId(null)}
        />
      )}
    </div>
  );
}

function FieldMapper({ template, onClose }: { template: any; onClose: () => void }) {
  const updateTemplate = useUpdateTemplate();
  const [fields, setFields] = useState<FieldMapping[]>(() => {
    const mappings = template.fieldMappings;
    if (!mappings) return [];
    if (Array.isArray(mappings)) return mappings as FieldMapping[];
    if (typeof mappings === 'object' && 'fields' in (mappings as any)) return (mappings as any).fields || [];
    return [];
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [dragField, setDragField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const addField = () => {
    const newField: FieldMapping = {
      id: `field_${Date.now()}`,
      fieldType: "custom",
      label: "New Field",
      x: 10,
      y: 10 + fields.length * 5,
      width: 200,
      height: 24,
      fontSize: 12,
      fontWeight: "normal",
      textAlign: "left",
    };
    setFields(prev => [...prev, newField]);
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FieldMapping>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleMouseDown = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;
    setDragField(fieldId);
    setDragOffset({
      x: (e.clientX - rect.left) * scaleX - field.x,
      y: (e.clientY - rect.top) * scaleY - field.y,
    });
  }, [fields, imageDimensions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragField || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;
    const newX = Math.max(0, (e.clientX - rect.left) * scaleX - dragOffset.x);
    const newY = Math.max(0, (e.clientY - rect.top) * scaleY - dragOffset.y);
    updateField(dragField, { x: Math.round(newX), y: Math.round(newY) });
  }, [dragField, dragOffset, imageDimensions]);

  const handleMouseUp = useCallback(() => {
    setDragField(null);
  }, []);

  const handleSave = () => {
    updateTemplate.mutate({
      id: template.id,
      fieldMappings: {
        fields,
        pageWidth: imageDimensions.width,
        pageHeight: imageDimensions.height,
      },
    }, {
      onSuccess: onClose,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="rounded-2xl sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map Fields - {template.name}</DialogTitle>
          <DialogDescription>
            Position fields on your template. Drag fields to move them, or enter coordinates manually.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div
              ref={canvasRef}
              className="relative border border-border rounded-xl overflow-hidden bg-muted/20 select-none"
              style={{ minHeight: "400px" }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {template.uploadedFileUrl && (
                <img
                  src={template.uploadedFileUrl}
                  alt="Template background"
                  className="w-full h-auto"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    setImageLoaded(true);
                  }}
                  draggable={false}
                />
              )}
              {imageLoaded && fields.map(field => {
                const canvas = canvasRef.current;
                if (!canvas) return null;
                const rect = canvas.getBoundingClientRect();
                const scaleX = rect.width / imageDimensions.width;
                const scaleY = rect.height / imageDimensions.height;
                return (
                  <div
                    key={field.id}
                    className={`absolute border-2 rounded-sm cursor-move flex items-center px-1 ${
                      dragField === field.id ? "border-primary bg-primary/20" : "border-blue-400 bg-blue-400/10"
                    }`}
                    style={{
                      left: `${field.x * scaleX}px`,
                      top: `${field.y * scaleY}px`,
                      width: `${field.width * scaleX}px`,
                      height: `${field.height * scaleY}px`,
                      fontSize: `${field.fontSize * scaleX}px`,
                    }}
                    onMouseDown={(e) => handleMouseDown(field.id, e)}
                    data-testid={`field-overlay-${field.id}`}
                  >
                    <span className="text-blue-700 dark:text-blue-300 truncate text-xs leading-none">
                      {FIELD_TYPE_OPTIONS.find(o => o.value === field.fieldType)?.label || field.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Fields</Label>
              <Button size="sm" variant="outline" onClick={addField} className="rounded-lg" data-testid="button-add-field">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No fields mapped yet. Click "Add" to start.</p>
              )}
              {fields.map(field => (
                <div key={field.id} className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Select
                      value={field.fieldType}
                      onValueChange={(val) => {
                        const opt = FIELD_TYPE_OPTIONS.find(o => o.value === val);
                        updateField(field.id, { fieldType: val, label: opt?.label || val });
                      }}
                    >
                      <SelectTrigger className="rounded-lg h-8 text-xs" data-testid={`select-field-type-${field.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => removeField(field.id)} className="h-7 w-7 text-destructive shrink-0" data-testid={`button-remove-field-${field.id}`}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">X</Label>
                      <Input type="number" className="h-7 text-xs rounded-md" value={field.x} onChange={(e) => updateField(field.id, { x: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Y</Label>
                      <Input type="number" className="h-7 text-xs rounded-md" value={field.y} onChange={(e) => updateField(field.id, { y: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">W</Label>
                      <Input type="number" className="h-7 text-xs rounded-md" value={field.width} onChange={(e) => updateField(field.id, { width: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">H</Label>
                      <Input type="number" className="h-7 text-xs rounded-md" value={field.height} onChange={(e) => updateField(field.id, { height: parseInt(e.target.value) || 20 })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Size</Label>
                      <Input type="number" className="h-7 text-xs rounded-md" value={field.fontSize} onChange={(e) => updateField(field.id, { fontSize: parseInt(e.target.value) || 12 })} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Weight</Label>
                      <Select value={field.fontWeight} onValueChange={(val) => updateField(field.id, { fontWeight: val })}>
                        <SelectTrigger className="h-7 text-xs rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Align</Label>
                      <Select value={field.textAlign} onValueChange={(val) => updateField(field.id, { textAlign: val })}>
                        <SelectTrigger className="h-7 text-xs rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={updateTemplate.isPending}
            className="rounded-xl"
            data-testid="button-save-mappings"
          >
            {updateTemplate.isPending ? "Saving..." : "Save Mappings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
