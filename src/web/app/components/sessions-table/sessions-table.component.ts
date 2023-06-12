import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  OnChanges,
} from '@angular/core';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { SimpleModalService } from '../../../services/simple-modal.service';
import {
  Course,
  FeedbackSessionPublishStatus,
  FeedbackSessionSubmissionStatus,
} from '../../../types/api-output';
import { SortBy, SortOrder } from '../../../types/sort-properties';
import { CopySessionModalResult } from '../copy-session-modal/copy-session-modal-model';
import { CopySessionModalComponent } from '../copy-session-modal/copy-session-modal.component';
import { SimpleModalType } from '../simple-modal/simple-modal-type';
import {
  CopySessionResult,
  SessionsTableColumn,
  SessionsTableHeaderColorScheme,
  SessionsTableRowModel,
} from './sessions-table-model';
import {
  ColumnData,
  SortableTableCellData,
} from '../sortable-table/sortable-table.component';
import { GroupButtonsComponent } from './group-buttons.component';
import { SubmissionStatusNamePipe } from '../teammates-common/submission-status-name.pipe';
import { PublishStatusNamePipe } from '../teammates-common/publish-status-name.pipe';
import { CellWithToolTipComponent } from './cell-with-tooltip.component';
import { SubmissionStatusTooltipPipe } from '../teammates-common/submission-status-tooltip.pipe';
import { FormatDateDetailPipe } from '../teammates-common/format-date-detail.pipe';
import { FormatDateBriefPipe } from '../teammates-common/format-date-brief.pipe';
import { PublishStatusTooltipPipe } from './publish-status-tooltip.pipe';
import { ResponseRateComponent } from './response-rate.component';

/**
 * A table to display a list of feedback sessions.
 */
@Component({
  selector: 'tm-sessions-table',
  templateUrl: './sessions-table.component.html',
  styleUrls: ['./sessions-table.component.scss'],
})
export class SessionsTableComponent implements OnInit, OnChanges {
  // enum
  SortBy: typeof SortBy = SortBy;
  SortOrder: typeof SortOrder = SortOrder;
  SessionsTableColumn: typeof SessionsTableColumn = SessionsTableColumn;
  FeedbackSessionSubmissionStatus: typeof FeedbackSessionSubmissionStatus =
    FeedbackSessionSubmissionStatus;
  FeedbackSessionPublishStatus: typeof FeedbackSessionPublishStatus =
    FeedbackSessionPublishStatus;
  SessionsTableHeaderColorScheme: typeof SessionsTableHeaderColorScheme =
    SessionsTableHeaderColorScheme;

  // variable
  rowClicked: number = -1;

  @Input()
  sessionsTableRowModels: SessionsTableRowModel[] = [];

  @Input()
  courseCandidates: Course[] = [];

  @Input()
  columnsToShow: SessionsTableColumn[] = [SessionsTableColumn.COURSE_ID];

  @Input()
  sessionsTableRowModelsSortBy: SortBy = SortBy.NONE;

  @Input()
  sessionsTableRowModelsSortOrder: SortOrder = SortOrder.ASC;

  @Input()
  headerColorScheme: SessionsTableHeaderColorScheme =
    SessionsTableHeaderColorScheme.BLUE;

  @Input()
  isSendReminderLoading: boolean = false;

  @Output()
  sortSessionsTableRowModelsEvent: EventEmitter<SortBy> = new EventEmitter();

  @Output()
  loadResponseRateEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  moveSessionToRecycleBinEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  copySessionEvent: EventEmitter<CopySessionResult> = new EventEmitter();

  @Output()
  submitSessionAsInstructorEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  publishSessionEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  unpublishSessionEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  resendResultsLinkToStudentsEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  downloadSessionResultsEvent: EventEmitter<number> = new EventEmitter();

  @Output()
  sendRemindersToAllNonSubmittersEvent: EventEmitter<number> =
    new EventEmitter();

  @Output()
  sendRemindersToSelectedNonSubmittersEvent: EventEmitter<number> =
    new EventEmitter();

  columnsData: ColumnData[] = [];
  rowsData: SortableTableCellData[][] = [];

  constructor(
    private ngbModal: NgbModal,
    private simpleModalService: SimpleModalService,
    private formatDateDetailPipe: FormatDateDetailPipe,
    private formatDateBriefPipe: FormatDateBriefPipe,
    private publishStatusName: PublishStatusNamePipe,
    private publishStatusTooltip: PublishStatusTooltipPipe
  ) {}

  ngOnInit(): void {
    this.setTableData();
  }

  ngOnChanges(): void {
    this.rowsData.forEach((row: SortableTableCellData[], idx: number) => {
      row[5] = {
        customComponent: {
          component: ResponseRateComponent,
          componentData: {
            responseRate: this.sessionsTableRowModels[idx].responseRate,
            empty: this.sessionsTableRowModels[idx].responseRate == '',
            isLoading: this.sessionsTableRowModels[idx].isLoadingResponseRate,
            onClick: () => {
              this.loadResponseRateEvent.emit(idx);
            },
            idx: idx,
          },
        },
      };
    });
    // this.setTableData();
  }

  setTableData(): void {
    this.columnsData = [
      { header: 'Session Name', sortBy: SortBy.SESSION_NAME },
      { header: 'Start Date', sortBy: SortBy.SESSION_START_DATE },
      { header: 'End Date', sortBy: SortBy.SESSION_END_DATE },
      { header: 'Submissions' },
      { header: 'Responses' },
      {
        header: 'Response Rate',
        headerToolTip: 'Number of students submitted / Class size',
      },
      {
        header: 'Action(s)',
      },
    ];
    this.rowsData = this.sessionsTableRowModels.map(
      (sessionTableRowModel: SessionsTableRowModel, idx: number) => {
        const submissionStatus =
          sessionTableRowModel.feedbackSession.submissionStatus;
        const deadlines = this.getDeadlines(sessionTableRowModel);
        const submissionStartTimestamp =
          sessionTableRowModel.feedbackSession.submissionStartTimestamp;
        const submissionEndTimestamp =
          sessionTableRowModel.feedbackSession.submissionEndTimestamp;
        const timeZone = sessionTableRowModel.feedbackSession.timeZone;
        const publishStatus =
          sessionTableRowModel.feedbackSession.publishStatus;

        return [
          {
            value: sessionTableRowModel.feedbackSession.feedbackSessionName,
          },
          {
            value: String(submissionStartTimestamp),
            customComponent: {
              component: CellWithToolTipComponent,
              componentData: {
                toolTip: this.formatDateDetailPipe.transform(
                  submissionStartTimestamp,
                  timeZone
                ),
                value: this.formatDateBriefPipe.transform(
                  submissionStartTimestamp,
                  timeZone
                ),
              },
            },
          },
          {
            value: String(submissionEndTimestamp),
            customComponent: {
              component: CellWithToolTipComponent,
              componentData: {
                toolTip: this.formatDateDetailPipe.transform(
                  submissionEndTimestamp,
                  timeZone
                ),
                value: this.formatDateBriefPipe.transform(
                  submissionEndTimestamp,
                  timeZone
                ),
              },
            },
          },
          {
            customComponent: {
              component: CellWithToolTipComponent,
              componentData: {
                toolTip: new SubmissionStatusTooltipPipe().transform(
                  submissionStatus,
                  deadlines
                ),
                value: new SubmissionStatusNamePipe().transform(
                  submissionStatus,
                  deadlines
                ),
              },
            },
          },
          {
            customComponent: {
              component: CellWithToolTipComponent,
              componentData: {
                toolTip: this.publishStatusTooltip.transform(publishStatus),
                value: this.publishStatusName.transform(publishStatus),
              },
            },
          },
          {
            customComponent: {
              component: ResponseRateComponent,
              componentData: {
                responseRate: sessionTableRowModel.responseRate,
                empty: sessionTableRowModel.responseRate == '',
                isLoading: sessionTableRowModel.isLoadingResponseRate,
                onClick: () => {
                  this.loadResponseRateEvent.emit(idx);
                },
                idx: idx,
              },
            },
          },
          {
            customComponent: {
              component: GroupButtonsComponent,
              componentData: {
                courseId: sessionTableRowModel.feedbackSession.courseId,
                fsName:
                  sessionTableRowModel.feedbackSession.feedbackSessionName,
                instructorPrivileges: sessionTableRowModel.instructorPrivilege,
                idx,
                submissionStatus:
                  sessionTableRowModel.feedbackSession.submissionStatus,
                publishStatus:
                  sessionTableRowModel.feedbackSession.publishStatus,
                onSubmitSessionAsInstructor: () => {
                  return this.submitSessionAsInstructorEvent.emit(idx);
                },
                isSendReminderLoading: this.isSendReminderLoading,
                rowClicked: this.rowClicked,
                copySession: () => {
                  this.copySession(idx);
                },
                moveSessionToRecycleBin: () => {
                  this.moveSessionToRecycleBin(idx);
                },
                unpublishSession: () => {
                  this.unpublishSession(idx);
                },
                publishSession: () => {
                  this.publishSession(idx);
                },
                remindResultsLinkToStudent: () => {
                  this.remindResultsLinkToStudent(idx);
                },
                downloadSessionResults: () => {
                  this.downloadSessionResults(idx);
                },
                sendRemindersToAllNonSubmitters: () => {
                  this.sendRemindersToAllNonSubmitters(idx);
                },
                sendRemindersToSelectedNonSubmitters: () => {
                  this.sendRemindersToSelectedNonSubmitters(idx);
                },
                setRowClicked: () => {
                  this.setRowClicked(idx);
                },
              },
            },
          },
        ];
      }
    );
  }

  /**
   * Sorts the list of feedback session row.
   */
  sortSessionsTableRowModels(by: SortBy): void {
    this.sortSessionsTableRowModelsEvent.emit(by);
  }

  getAriaSort(by: SortBy): String {
    if (by !== this.sessionsTableRowModelsSortBy) {
      return 'none';
    }
    return this.sessionsTableRowModelsSortOrder === SortOrder.ASC
      ? 'ascending'
      : 'descending';
  }

  /**
   * Moves the feedback session to the recycle bin.
   */
  moveSessionToRecycleBin(rowIndex: number): void {
    const modalContent: string =
      'Session will be moved to the recycle bin. ' +
      'This action can be reverted by going to the "Sessions" tab and restoring the desired session(s).';
    const modalRef: NgbModalRef = this.simpleModalService.openConfirmationModal(
      `Delete session <strong>${this.sessionsTableRowModels[rowIndex].feedbackSession.feedbackSessionName}</strong>?`,
      SimpleModalType.WARNING,
      modalContent
    );
    modalRef.result.then(
      () => {
        this.moveSessionToRecycleBinEvent.emit(rowIndex);
      },
      () => {}
    );
  }

  /**
   * Copies the feedback session.
   */
  copySession(rowIndex: number): void {
    const modalRef: NgbModalRef = this.ngbModal.open(CopySessionModalComponent);
    const model: SessionsTableRowModel = this.sessionsTableRowModels[rowIndex];
    modalRef.componentInstance.newFeedbackSessionName =
      model.feedbackSession.feedbackSessionName;
    modalRef.componentInstance.courseCandidates = this.courseCandidates;
    modalRef.componentInstance.sessionToCopyCourseId =
      model.feedbackSession.courseId;

    modalRef.result.then(
      (result: CopySessionModalResult) => {
        this.copySessionEvent.emit({
          ...result,
          sessionToCopyRowIndex: rowIndex,
        });
      },
      () => {}
    );
  }

  /**
   * Publishes a feedback session.
   */
  publishSession(rowIndex: number): void {
    const model: SessionsTableRowModel = this.sessionsTableRowModels[rowIndex];

    const modalRef: NgbModalRef = this.simpleModalService.openConfirmationModal(
      `Publish session <strong>${model.feedbackSession.feedbackSessionName}</strong>?`,
      SimpleModalType.WARNING,
      'An email will be sent to students to inform them that the responses are ready for viewing.'
    );

    modalRef.result.then(
      () => {
        this.publishSessionEvent.emit(rowIndex);
      },
      () => {}
    );
  }

  /**
   * Unpublishes a feedback session.
   */
  unpublishSession(rowIndex: number): void {
    const model: SessionsTableRowModel = this.sessionsTableRowModels[rowIndex];
    const modalContent: string = `An email will be sent to students to inform them that the session has been unpublished
        and the session responses will no longer be viewable by students.`;

    const modalRef: NgbModalRef = this.simpleModalService.openConfirmationModal(
      `Unpublish session <strong>${model.feedbackSession.feedbackSessionName}</strong>?`,
      SimpleModalType.WARNING,
      modalContent
    );

    modalRef.result.then(
      () => {
        this.unpublishSessionEvent.emit(rowIndex);
      },
      () => {}
    );
  }

  /**
   * Resend links to students to view results.
   */
  remindResultsLinkToStudent(rowIndex: number): void {
    this.resendResultsLinkToStudentsEvent.emit(rowIndex);
  }

  /**
   * Sends e-mails to remind all students and instructors who have not submitted their feedback.
   */
  sendRemindersToAllNonSubmitters(rowIndex: number): void {
    this.sendRemindersToAllNonSubmittersEvent.emit(rowIndex);
  }

  /**
   * Sends e-mails to remind selected students and instructors who have not submitted their feedback.
   */
  sendRemindersToSelectedNonSubmitters(rowIndex: number): void {
    this.sendRemindersToSelectedNonSubmittersEvent.emit(rowIndex);
  }

  /**
   * Triggers the download of session results as a CSV file.
   */
  downloadSessionResults(rowIndex: number): void {
    this.downloadSessionResultsEvent.emit(rowIndex);
  }

  /**
   * Set row number of button clicked.
   */
  setRowClicked(rowIndex: number): void {
    this.rowClicked = rowIndex;
  }

  /**
   * Get the deadlines for student and instructors.
   */
  getDeadlines(model: SessionsTableRowModel): {
    studentDeadlines: Record<string, number>;
    instructorDeadlines: Record<string, number>;
  } {
    return {
      studentDeadlines: model.feedbackSession.studentDeadlines,
      instructorDeadlines: model.feedbackSession.instructorDeadlines,
    };
  }
}
