import {
  Component,
  Input,
  OnInit,
  signal,
  computed,
  inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractDetails } from '../../../customers/models/client-statement.model';
import { ContractsService } from '../../services/contracts.service';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { WhatsappSendButtonComponent } from '../../../../shared/components/whatsapp-send-button/whatsapp-send-button.component';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { paymentFrequencyLabel } from '../../constants/contract-labels';
import { buildContractLayout } from '../../utils/contract-pdf';

@Component({
  selector: 'app-contract-print-modal',
  standalone: true,
  imports: [CommonModule, WhatsappSendButtonComponent],
  templateUrl: './contract-print-modal.component.html',
  styleUrl: './contract-print-modal.component.scss',
})
export class ContractPrintModalComponent implements OnInit, OnDestroy {
  @Input({ required: true }) contractId!: number;
  @Input({ required: true }) onClose!: () => void;
  /** Opened from "حفظ وإرسال واتساب": send to the client as soon as it loads. */
  @Input() autoSendWhatsapp = false;

  private readonly contractsService = inject(ContractsService);
  private readonly pdf = inject(PdfExportService);

  details = signal<ContractDetails | null>(null);
  loading = signal(true);
  error = signal(false);

  protected readonly today = new Date();

  protected readonly totalAmount = computed(() => {
    const d = this.details();
    if (!d) return 0;
    return d.summary.totalContractAmount;
  });

  protected readonly remainingAfterInstallment = computed(() => {
    const d = this.details();
    if (!d) return (_seq: number) => 0;

    const installments = d.installments ?? [];
    const total = d.summary.totalContractAmount;
    const installmentMap = new Map(installments.map((inst) => [inst.sequence, inst.dueAmount]));

    return (seq: number) => {
      const currentAmount = installmentMap.get(seq) ?? d.contract.installmentAmount;
      const priorAmount = installments
        .filter((inst) => inst.sequence < seq)
        .reduce((sum, inst) => sum + (inst.dueAmount ?? 0), 0);
      return Math.max(0, total - priorAmount - currentAmount);
    };
  });

  ngOnInit(): void {
    this.contractsService.getDetails(this.contractId).subscribe({
      next: (data) => {
        this.details.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
  }

  print(): void {
    window.print();
  }

  protected readonly whatsappCaption = computed(() => {
    const d = this.details();
    if (!d) return '';
    return [
      `عقد تقسيط رقم ${d.contract.id}`,
      `إجمالي العقد: ${formatMoneyAr(d.summary.totalContractAmount)}`,
      `المقدم: ${formatMoneyAr(d.contract.downPayment)}`,
      `عدد الأقساط: ${d.contract.installmentsCount} (${this.frequencyLabel(d.contract.paymentFrequency)})`,
    ].join('\n');
  });

  /** Contract summary + schedule, then one receipt page per installment. */
  protected readonly buildContractPdf = (): Promise<string> => {
    const d = this.details();
    if (!d) return Promise.reject(new Error('Contract not loaded'));
    return this.pdf.render(buildContractLayout(d));
  };

  frequencyLabel(freq: string): string {
    return paymentFrequencyLabel(freq);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  installmentDueDate(firstDate: string, index: number, freq: string): string {
    if (!firstDate) return '';
    const d = new Date(firstDate);
    const months =
      freq === 'Monthly' ? 1 : freq === 'Quarterly' ? 3 : 6;
    d.setMonth(d.getMonth() + index * months);
    return this.formatDate(d.toISOString());
  }
}
