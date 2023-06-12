import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { InstructorPermissionSet } from 'src/web/types/api-request';
import { TeammatesRouterModule } from '../teammates-router/teammates-router.module';
import {
  FeedbackSessionPublishStatus,
  FeedbackSessionSubmissionStatus,
} from 'src/web/types/api-output';
import { SessionsTableHeaderColorScheme } from './sessions-table-model';
import { AjaxLoadingModule } from '../ajax-loading/ajax-loading.module';
import {
  NgbDropdownModule,
  NgbTooltipModule,
} from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'tm-group-buttons',
  templateUrl: './group-buttons.component.html',
  standalone: true,
  imports: [
    CommonModule,
    TeammatesRouterModule,
    AjaxLoadingModule,
    NgbDropdownModule,
    NgbTooltipModule,
  ],
})
export class GroupButtonsComponent {
  @Input() idx: number = 0;
  @Input() fsName: string = '';
  @Input() courseId: string = '';
  @Input() rowClicked: number = 0;
  @Input() isSendReminderLoading: boolean = false;

  @Input() publishStatus: FeedbackSessionPublishStatus =
    FeedbackSessionPublishStatus.NOT_PUBLISHED;
  @Input() submissionStatus: FeedbackSessionSubmissionStatus =
    FeedbackSessionSubmissionStatus.NOT_VISIBLE;

  @Input() instructorPrivileges: InstructorPermissionSet = {
    canModifyCourse: false,
    canModifyInstructor: false,
    canModifySession: false,
    canModifyStudent: false,
    canViewStudentInSections: false,
    canViewSessionInSections: false,
    canSubmitSessionInSections: false,
    canModifySessionCommentsInSections: false,
  };

  @Input() copySession: () => void = () => {};
  @Input() moveSessionToRecycleBin: () => void = () => {};
  @Input() unpublishSession: () => void = () => {};
  @Input() publishSession: () => void = () => {};
  @Input() remindResultsLinkToStudent: () => void = () => {};
  @Input() downloadSessionResults: () => void = () => {};
  @Input() sendRemindersToAllNonSubmitters: () => void = () => {};
  @Input() sendRemindersToSelectedNonSubmitters: () => void = () => {};
  @Input() setRowClicked: () => void = () => {};
  @Input() onSubmitSessionAsInstructor: () => void = () => {};

  // enum
  FeedbackSessionSubmissionStatus: typeof FeedbackSessionSubmissionStatus =
    FeedbackSessionSubmissionStatus;
  FeedbackSessionPublishStatus: typeof FeedbackSessionPublishStatus =
    FeedbackSessionPublishStatus;
  SessionsTableHeaderColorScheme: typeof SessionsTableHeaderColorScheme =
    SessionsTableHeaderColorScheme;
}
