import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { ProductCategory } from '../../core/shop-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { InventoryUnit, Product } from './product.models';
import { ProductsApiService } from './products-api.service';
import { duplicateSerials, errorMessage, moneyValidator, parseSerials } from './shared';

/**
 * Adds stock: a product (existing, or new with brand/model/category) and one serial number per
 * physical unit. Employees and owners both use it; the server records who added each unit.
 */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'INVENTORY' | t }}</div><h1>{{ 'Add stock' | t }}</h1><p>{{ 'Every unit needs its own serial number. Enter one per line.' | t }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ '← Back to inventory' | t }}</a>
      </div>

      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}
        <ul *ngIf="rejectedSerials().length" class="serial-list"><li *ngFor="let s of rejectedSerials()"><code dir="ltr">{{ s }}</code></li></ul>
      </div>

      <section *ngIf="added() as result" class="surface-card record-form-card added-result" role="status">
        <h2>{{ result.units.length === 1 ? ('1 unit of {product} added to stock.' | t:{ product: result.product.name }) : ('{count} units of {product} added to stock.' | t:{ count: result.units.length, product: result.product.name }) }}</h2>
        <ul class="serial-list"><li *ngFor="let u of result.units"><a [routerLink]="portal.link('inventory', 'units', u._id)"><code dir="ltr">{{ u.serialNumber }}</code></a></li></ul>
        <div class="record-form-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ 'View inventory' | t }}</a>
          <button type="button" class="btn btn-small" (click)="addMore()">{{ 'Add more stock' | t }}</button>
        </div>
      </section>

      <form *ngIf="!added()" class="surface-card record-form-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset class="form-section">
          <legend>{{ 'Product' | t }}</legend>
          <div class="sale-type-toggle" role="radiogroup" [attr.aria-label]="'Product' | t">
            <label [class.active]="form.controls.mode.value === 'new'"><input type="radio" formControlName="mode" value="new"> {{ 'New product' | t }}<small>{{ 'A model you haven’t stocked before' | t }}</small></label>
            <label [class.active]="form.controls.mode.value === 'existing'"><input type="radio" formControlName="mode" value="existing" [attr.disabled]="products().length ? null : true"> {{ 'Existing product' | t }}<small>{{ products().length ? ('More units of a product already in your catalog' | t) : ('Your catalog is empty' | t) }}</small></label>
          </div>

          <div *ngIf="form.controls.mode.value === 'existing'" class="record-form-grid">
            <label class="record-form-wide">{{ 'Product' | t }}
              <select formControlName="productId">
                <option value="" disabled>{{ 'Choose a product' | t }}</option>
                <option *ngFor="let p of products()" [value]="p._id">{{ p.brand }} {{ p.model }} — {{ p.name }}</option>
              </select>
              <small class="field-error" *ngIf="invalid('productId')">{{ 'Choose a product.' | t }}</small>
            </label>
          </div>

          <div *ngIf="form.controls.mode.value === 'new'" class="record-form-grid" formGroupName="product">
            <label class="record-form-wide">{{ 'Product name' | t }}<input formControlName="name" maxlength="120" [placeholder]="'e.g. Samsung Galaxy S25 Ultra 256GB' | t">
              <small class="field-error" *ngIf="invalid('product.name')">{{ 'Enter the product name.' | t }}</small></label>
            <label>{{ 'Brand' | t }}<input formControlName="brand" maxlength="60" [placeholder]="'e.g. Samsung' | t">
              <small class="field-error" *ngIf="invalid('product.brand')">{{ 'Enter the brand.' | t }}</small></label>
            <label>{{ 'Model' | t }}<input formControlName="model" maxlength="80" dir="ltr" [placeholder]="'e.g. Galaxy S25' | t">
              <small class="field-error" *ngIf="invalid('product.model')">{{ 'Enter the model.' | t }}</small></label>
            <label>{{ 'Category' | t }}
              <select formControlName="category">
                <option value="" disabled>{{ categories().length ? ('Choose a category' | t) : ('Loading categories...' | t) }}</option>
                <option *ngFor="let c of categories()" [value]="c.name">{{ c.name | t }}</option>
              </select>
              <small class="field-error" *ngIf="invalid('product.category')">{{ 'Choose a category.' | t }}</small></label>
            <label>{{ 'Sub-category' | t }}
              <select formControlName="subCategory">
                <option value="" disabled>{{ form.controls.product.controls.category.value ? ('Choose a sub-category' | t) : ('Choose a category first' | t) }}</option>
                <option *ngFor="let s of subCategories()" [value]="s">{{ s | t }}</option>
              </select>
              <small class="field-error" *ngIf="invalid('product.subCategory')">{{ 'Choose a sub-category.' | t }}</small></label>
            <label class="record-form-wide">{{ 'Description' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><textarea formControlName="description" rows="2" maxlength="1000"></textarea></label>
            <label class="record-form-wide">{{ 'Image links' | t }} <span class="optional-label">{{ 'Optional · one https:// link per line, up to 5' | t }}</span><textarea formControlName="imageUrls" rows="2" dir="ltr"></textarea>
              <small class="field-error" *ngIf="invalid('product.imageUrls')">{{ 'Use up to 5 links starting with http:// or https://' | t }}</small></label>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>{{ 'Serial numbers' | t }}</legend>
          <label class="serials-field">{{ 'One serial number per line' | t }}
            <textarea formControlName="serials" rows="5" dir="ltr" spellcheck="false" placeholder="SAM001"></textarea>
          </label>
          <p class="serial-count" [class.field-error]="duplicates().length">
            {{ serialCount() === 1 ? ('1 unit will be added.' | t) : ('{count} units will be added.' | t:{ count: serialCount() }) }}
            <ng-container *ngIf="duplicates().length">{{ 'Entered more than once: {serials}' | t:{ serials: duplicates().join(', ') } }}</ng-container>
          </p>
          <small class="field-error" *ngIf="invalid('serials') && !serialCount()">{{ 'Enter at least one serial number. Every unit needs one.' | t }}</small>
        </fieldset>

        <fieldset class="form-section">
          <legend>{{ 'Prices and supplier' | t }}</legend>
          <div class="record-form-grid">
            <label>{{ 'Purchase price (Rs)' | t }}<input type="number" formControlName="purchasePrice" min="0" step="0.01">
              <small class="hint" *ngIf="!portal.can('inventory.viewCost')">{{ 'Only the shop owner can change this later.' | t }}</small>
              <small class="field-error" *ngIf="invalid('purchasePrice')">{{ 'Enter an amount of zero or more, with at most 2 decimals.' | t }}</small></label>
            <label>{{ 'Selling price (Rs)' | t }}<input type="number" formControlName="sellingPrice" min="0" step="0.01">
              <small class="field-error" *ngIf="invalid('sellingPrice')">{{ 'Enter an amount of zero or more, with at most 2 decimals.' | t }}</small></label>
            <ng-container formGroupName="supplier">
              <label>{{ 'Supplier' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="name" maxlength="120"></label>
              <label>{{ 'Supplier phone' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="phone" type="tel" maxlength="40"></label>
              <label>{{ 'Supplier invoice' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="invoiceRef" maxlength="60" dir="ltr"></label>
            </ng-container>
          </div>
        </fieldset>

        <div class="record-form-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ 'Cancel' | t }}</a>
          <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : serialCount() > 1 ? ('Add {count} units' | t:{ count: serialCount() }) : ('Add to stock' | t) }}</button>
        </div>
      </form>
    </div>
  `
})
export class AddProductComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  categories = signal<ProductCategory[]>([]);
  products = signal<Product[]>([]);
  saving = signal(false);
  error = signal<Msg>('');
  rejectedSerials = signal<string[]>([]);
  added = signal<{ product: Product; units: InventoryUnit[] } | null>(null);

  form = this.fb.nonNullable.group({
    mode: ['new' as 'new' | 'existing'],
    productId: [''],
    product: this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      brand: ['', [Validators.required, Validators.maxLength(60)]],
      model: ['', [Validators.required, Validators.maxLength(80)]],
      category: ['', Validators.required],
      subCategory: ['', Validators.required],
      description: [''],
      imageUrls: ['', (c: { value: string }) => {
        const urls = (c.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return urls.length > 5 || urls.some(u => !/^https?:\/\/\S+$/i.test(u)) ? { urls: true } : null;
      }]
    }),
    serials: ['', Validators.required],
    purchasePrice: [null as number | null, [Validators.required, moneyValidator()]],
    sellingPrice: [null as number | null, [Validators.required, moneyValidator()]],
    supplier: this.fb.nonNullable.group({ name: [''], phone: [''], invoiceRef: [''] })
  });

  private serialsValue = toSignal(this.form.controls.serials.valueChanges, { initialValue: '' });
  private categoryValue = toSignal(this.form.controls.product.controls.category.valueChanges, { initialValue: '' });
  serialCount = computed(() => parseSerials(this.serialsValue()).length);
  duplicates = computed(() => duplicateSerials(parseSerials(this.serialsValue())));
  subCategories = computed(() => this.categories().find(c => c.name === this.categoryValue())?.subCategories ?? []);

  ngOnInit() {
    this.api.categories().subscribe({ next: c => this.categories.set(c), error: e => this.error.set(errorMessage(e, tk('Unable to load product categories. Reload the page to try again.'))) });
    this.api.products({ page: 1, limit: 100, search: '', sort: 'brand', order: 'asc' }).subscribe({ next: p => this.products.set(p.records), error: () => undefined });
    // Picking a category resets the sub-category (auto-selected when there's only one).
    this.form.controls.product.controls.category.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(name => {
      const subs = this.categories().find(c => c.name === name)?.subCategories ?? [];
      this.form.controls.product.controls.subCategory.setValue(subs.length === 1 ? subs[0] : '');
    });
    // Only the active product section is validated.
    this.form.controls.mode.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(mode => this.applyMode(mode));
    this.applyMode('new');
  }

  invalid(path: string): boolean {
    const control = this.form.get(path);
    return Boolean(control && control.invalid && (control.touched || this.submitted));
  }

  private submitted = false;

  submit() {
    this.submitted = true;
    this.error.set('');
    this.rejectedSerials.set([]);
    const serials = parseSerials(this.form.controls.serials.value);
    if (!serials.length) this.form.controls.serials.setErrors({ required: true });
    if (this.form.invalid || !serials.length) { this.form.markAllAsTouched(); this.error.set(tk('Check the highlighted fields.')); return; }
    if (this.duplicates().length) { this.error.set(msg('Entered more than once: {serials}', { serials: this.duplicates().join(', ') })); return; }
    const v = this.form.getRawValue();
    const supplier = Object.fromEntries(Object.entries(v.supplier).map(([k, s]) => [k, s.trim()]));
    this.saving.set(true);
    this.api.addStock({
      ...(v.mode === 'existing' ? { productId: v.productId } : {
        product: { ...v.product, imageUrls: v.product.imageUrls.split(/\r?\n/).map(s => s.trim()).filter(Boolean) }
      }),
      serialNumbers: serials,
      purchasePrice: Number(v.purchasePrice),
      sellingPrice: Number(v.sellingPrice),
      supplier
    }).subscribe({
      next: result => { this.saving.set(false); this.added.set(result); },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(errorMessage(e, tk('Unable to add stock. Please try again.')));
        if (e instanceof HttpErrorResponse && e.error?.code === 'DUPLICATE_SERIAL') this.rejectedSerials.set(e.error.details?.serials ?? []);
      }
    });
  }

  addMore() {
    const productId = this.added()?.product._id ?? '';
    this.added.set(null);
    this.submitted = false;
    this.api.products({ page: 1, limit: 100, search: '', sort: 'brand', order: 'asc' }).subscribe({ next: p => this.products.set(p.records), error: () => undefined });
    this.form.reset();
    this.form.patchValue({ mode: 'existing', productId });
  }

  private applyMode(mode: 'new' | 'existing') {
    const product = this.form.controls.product, productId = this.form.controls.productId;
    if (mode === 'existing') { product.disable({ emitEvent: false }); productId.setValidators(Validators.required); }
    else { product.enable({ emitEvent: false }); productId.clearValidators(); }
    productId.updateValueAndValidity({ emitEvent: false });
  }
}
