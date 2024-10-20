import {
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core'
import { SavedViewService } from 'src/app/services/rest/saved-view.service'
import { SettingsService } from 'src/app/services/settings.service'
import { ComponentWithPermissions } from '../with-permissions/with-permissions.component'
import { TourService } from 'ngx-ui-tour-ng-bootstrap'
import { SavedView } from 'src/app/data/saved-view'
import { ToastService } from 'src/app/services/toast.service'
import {
  CdkDragDrop,
  CdkDragEnd,
  CdkDragStart,
  moveItemInArray,
} from '@angular/cdk/drag-drop'
import { environment } from 'src/environments/environment'
// Copy from document list
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { filter, first, map, Subject, switchMap, takeUntil } from 'rxjs'
import { FilterRule } from 'src/app/data/filter-rule'
import {
  filterRulesDiffer,
  isFullTextFilterRule,
} from 'src/app/utils/filter-rules'
import { FILTER_FULLTEXT_MORELIKE } from 'src/app/data/filter-rule-type'
import {
  DEFAULT_DISPLAY_FIELDS,
  DisplayField,
  DisplayMode,
  Document,
} from 'src/app/data/document'
import { SETTINGS_KEYS } from 'src/app/data/ui-settings'
import {
  SortableDirective,
  SortEvent,
} from 'src/app/directives/sortable.directive'
import { ConsumerStatusService } from 'src/app/services/consumer-status.service'
import { DocumentListViewService } from 'src/app/services/document-list-view.service'
import { OpenDocumentsService } from 'src/app/services/open-documents.service'
import { PermissionsService } from 'src/app/services/permissions.service'
import { FilterEditorComponent } from '../document-list/filter-editor/filter-editor.component'
import { SaveViewConfigDialogComponent } from '../document-list/save-view-config-dialog/save-view-config-dialog.component'
import { HotKeyService } from 'src/app/services/hot-key.service'

@Component({
  selector: 'pngx-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent extends ComponentWithPermissions {
  DisplayField = DisplayField
  DisplayMode = DisplayMode
  public dashboardViews: SavedView[] = []
  constructor(
    public settingsService: SettingsService,
    public savedViewService: SavedViewService,
    private tourService: TourService,
    private toastService: ToastService,
    // Copy From Document List
    public list: DocumentListViewService,
    public route: ActivatedRoute,
    private router: Router,
    private modalService: NgbModal,
    private consumerStatusService: ConsumerStatusService,
    public openDocumentsService: OpenDocumentsService,
    private hotKeyService: HotKeyService,
    public permissionService: PermissionsService
  ) {
    super()
    this.savedViewService.listAll().subscribe(() => {
      this.dashboardViews = this.savedViewService.dashboardViews
    })
  }

  @ViewChild('filterEditor')
  private filterEditor: FilterEditorComponent

  @ViewChildren(SortableDirective) headers: QueryList<SortableDirective>

  get subtitle() {
    if (this.settingsService.displayName) {
      return $localize`Hello ${this.settingsService.displayName}, welcome to ${environment.appTitle}`
    } else {
      return $localize`Welcome to ${environment.appTitle}`
    }
  }

  completeTour() {
    if (this.tourService.getStatus() !== 0) {
      this.tourService.end() // will call settingsService.completeTour()
    } else {
      this.settingsService.completeTour()
    }
  }

  onDragStart(event: CdkDragStart) {
    this.settingsService.globalDropzoneEnabled = false
  }

  onDragEnd(event: CdkDragEnd) {
    this.settingsService.globalDropzoneEnabled = true
  }

  onDrop(event: CdkDragDrop<SavedView[]>) {
    moveItemInArray(
      this.dashboardViews,
      event.previousIndex,
      event.currentIndex
    )

    this.settingsService
      .updateDashboardViewsSort(this.dashboardViews)
      .subscribe({
        next: () => {
          this.toastService.showInfo($localize`Dashboard updated`)
        },
        error: (e) => {
          this.toastService.showError($localize`Error updating dashboard`, e)
        },
      })
  }

  // Copy from document list
  get activeDisplayFields(): DisplayField[] {
    return this.list.displayFields
  }

  set activeDisplayFields(fields: DisplayField[]) {
    this.list.displayFields = fields
    this.updateDisplayCustomFields()
  }
  activeDisplayCustomFields: Set<string> = new Set()

  public updateDisplayCustomFields() {
    this.activeDisplayCustomFields = new Set(
      Array.from(this.activeDisplayFields).filter(
        (field) =>
          typeof field === 'string' &&
          field.startsWith(DisplayField.CUSTOM_FIELD)
      )
    )
  }

  unmodifiedFilterRules: FilterRule[] = []
  private unmodifiedSavedView: SavedView

  private unsubscribeNotifier: Subject<any> = new Subject()

  get savedViewIsModified(): boolean {
    if (!this.list.activeSavedViewId || !this.unmodifiedSavedView) return false
    else {
      return (
        this.unmodifiedSavedView.sort_field !== this.list.sortField ||
        this.unmodifiedSavedView.sort_reverse !== this.list.sortReverse ||
        (this.unmodifiedSavedView.page_size &&
          this.unmodifiedSavedView.page_size !== this.list.pageSize) ||
        (this.unmodifiedSavedView.display_mode &&
          this.unmodifiedSavedView.display_mode !== this.list.displayMode) ||
        // if the saved view has no display mode, we assume it's small cards
        (!this.unmodifiedSavedView.display_mode &&
          this.list.displayMode !== DisplayMode.SMALL_CARDS) ||
        (this.unmodifiedSavedView.display_fields &&
          this.unmodifiedSavedView.display_fields.join(',') !==
            this.activeDisplayFields.join(',')) ||
        (!this.unmodifiedSavedView.display_fields &&
          this.activeDisplayFields.join(',') !==
            DEFAULT_DISPLAY_FIELDS.filter((f) => f.id !== DisplayField.ADDED)
              .map((f) => f.id)
              .join(',')) ||
        filterRulesDiffer(
          this.unmodifiedSavedView.filter_rules,
          this.list.filterRules
        )
      )
    }
  }

  get isFiltered() {
    return !!this.filterEditor?.rulesModified
  }

  getTitle() {
    let title = this.list.activeSavedViewTitle
    if (title && this.savedViewIsModified) {
      title += '*'
    } else if (!title) {
      title = $localize`Documents`
    }
    return title
  }

  getSortFields() {
    return isFullTextFilterRule(this.list.filterRules)
      ? this.list.sortFieldsFullText
      : this.list.sortFields
  }

  set listSortReverse(reverse: boolean) {
    this.list.sortReverse = reverse
  }

  get listSortReverse(): boolean {
    return this.list.sortReverse
  }

  onSort(event: SortEvent) {
    this.list.setSort(event.column, event.reverse)
  }

  get isBulkEditing(): boolean {
    return this.list.selected.size > 0
  }

  toggleDisplayField(field: DisplayField) {
    if (this.activeDisplayFields.includes(field)) {
      this.activeDisplayFields = this.activeDisplayFields.filter(
        (f) => f !== field
      )
    } else {
      this.activeDisplayFields = [...this.activeDisplayFields, field]
    }
    this.updateDisplayCustomFields()
  }

  public getDisplayCustomFieldTitle(field: string) {
    return this.settingsService.allDisplayFields.find((f) => f.id === field)
      ?.name
  }

  ngOnDestroy() {
    this.list.cancelPending()
    this.unsubscribeNotifier.next(this)
    this.unsubscribeNotifier.complete()
  }

  saveViewConfig() {
    if (this.list.activeSavedViewId != null) {
      let savedView: SavedView = {
        id: this.list.activeSavedViewId,
        filter_rules: this.list.filterRules,
        sort_field: this.list.sortField,
        sort_reverse: this.list.sortReverse,
        display_mode: this.list.displayMode,
        display_fields: this.activeDisplayFields,
      }
      this.savedViewService
        .patch(savedView)
        .pipe(first())
        .subscribe((view) => {
          this.unmodifiedSavedView = view
          this.toastService.showInfo(
            $localize`View "${this.list.activeSavedViewTitle}" saved successfully.`
          )
          this.unmodifiedFilterRules = this.list.filterRules
        })
    }
  }

  loadViewConfig(viewID: number) {
    this.savedViewService
      .getCached(viewID)
      .pipe(first())
      .subscribe((view) => {
        this.unmodifiedSavedView = view
        this.list.activateSavedView(view)
        this.list.reload()
      })
  }

  saveViewConfigAs() {
    let modal = this.modalService.open(SaveViewConfigDialogComponent, {
      backdrop: 'static',
    })
    modal.componentInstance.defaultName = this.filterEditor.generateFilterName()
    modal.componentInstance.saveClicked.pipe(first()).subscribe((formValue) => {
      modal.componentInstance.buttonsEnabled = false
      let savedView: SavedView = {
        name: formValue.name,
        show_on_dashboard: formValue.showOnDashboard,
        show_in_sidebar: formValue.showInSideBar,
        filter_rules: this.list.filterRules,
        sort_reverse: this.list.sortReverse,
        sort_field: this.list.sortField,
        display_mode: this.list.displayMode,
        display_fields: this.activeDisplayFields,
      }

      this.savedViewService
        .create(savedView)
        .pipe(first())
        .subscribe({
          next: () => {
            modal.close()
            this.toastService.showInfo(
              $localize`View "${savedView.name}" created successfully.`
            )
          },
          error: (httpError) => {
            let error = httpError.error
            if (error.filter_rules) {
              error.filter_rules = error.filter_rules.map((r) => r.value)
            }
            modal.componentInstance.error = error
            modal.componentInstance.buttonsEnabled = true
          },
        })
    })
  }

  openDocumentDetail(document: Document | number) {
    this.router.navigate([
      'documents',
      typeof document === 'number' ? document : document.id,
    ])
  }

  toggleSelected(document: Document, event: MouseEvent): void {
    if (!event.shiftKey) this.list.toggleSelected(document)
    else this.list.selectRangeTo(document)
  }

  clickTag(tagID: number) {
    this.list.selectNone()
    this.filterEditor.toggleTag(tagID)
  }

  clickCorrespondent(correspondentID: number) {
    this.list.selectNone()
    this.filterEditor.toggleCorrespondent(correspondentID)
  }

  clickDocumentType(documentTypeID: number) {
    this.list.selectNone()
    this.filterEditor.toggleDocumentType(documentTypeID)
  }

  clickStoragePath(storagePathID: number) {
    this.list.selectNone()
    this.filterEditor.toggleStoragePath(storagePathID)
  }

  clickMoreLike(documentID: number) {
    this.list.quickFilter([
      { rule_type: FILTER_FULLTEXT_MORELIKE, value: documentID.toString() },
    ])
  }

  get notesEnabled(): boolean {
    return this.settingsService.get(SETTINGS_KEYS.NOTES_ENABLED)
  }

  resetFilters() {
    this.filterEditor.resetSelected()
  }
}
