import { DOCUMENT } from '@angular/common';
import { Component, Inject, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HotTableRegisterer } from '@handsontable/angular';
import Handsontable from 'handsontable';
import { DetailedSettings } from 'handsontable/plugins/contextMenu';
import { PageScrollService } from 'ngx-page-scroll-core';
import { concat, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { CourseService } from '../../../services/course.service';
import { ProgressBarService } from '../../../services/progress-bar.service';
import { SimpleModalService } from '../../../services/simple-modal.service';
import { StatusMessageService } from '../../../services/status-message.service';
import { StudentService } from '../../../services/student.service';
import {
  EnrollStudents,
  HasResponses,
  JoinState,
  Student,
  Students,
} from '../../../types/api-output';
import {
  StudentEnrollRequest,
  StudentsEnrollRequest,
} from '../../../types/api-request';
import { SimpleModalType } from '../../components/simple-modal/simple-modal-type';
import { StatusMessage } from '../../components/status-message/status-message';
import { collapseAnim } from '../../components/teammates-common/collapse-anim';
import { ErrorMessageOutput } from '../../error-message-output';
import { EnrollStatus } from './enroll-status';

interface EnrollResultPanel {
  status: EnrollStatus;
  messageForEnrollmentStatus: string;
  studentList: Student[];
}

/**
 * Instructor course enroll page.
 */
@Component({
  selector: 'tm-instructor-course-enroll-page',
  templateUrl: './instructor-course-enroll-page.component.html',
  styleUrls: ['./instructor-course-enroll-page.component.scss'],
  animations: [collapseAnim],
})
export class InstructorCourseEnrollPageComponent implements OnInit {
  GENERAL_ERROR_MESSAGE: string = `You may check that: "Section" and "Comment" are optional while "Team", "Name",
        and "Email" must be filled. "Section", "Team", "Name", and "Comment" should start with an
        alphabetical character, unless wrapped by curly brackets "{}", and should not contain vertical bar "|" and
        percentage sign "%". "Email" should contain some text followed by one "@" sign followed by some
        more text. "Team" should not have the same format as email to avoid mis-interpretation.`;
  SECTION_ERROR_MESSAGE: string =
    'Section cannot be empty if the total number of students is more than 100. ';
  TEAM_ERROR_MESSAGE: string =
    'Duplicated team detected in different sections. ';

  // enum
  EnrollStatus: typeof EnrollStatus = EnrollStatus;
  courseId: string = '';
  coursePresent?: boolean;
  isLoadingCourseEnrollPage: boolean = false;
  showEnrollResults?: boolean = false;
  errorMessage: string = '';
  statusMessage: StatusMessage[] = [];
  unsuccessfulEnrolls: { [email: string]: string } = {};

  @Input() isNewStudentsPanelCollapsed: boolean = false;
  @Input() isExistingStudentsPanelCollapsed: boolean = true;

  colHeaders: string[] = ['Section', 'Team', 'Name', 'Email', 'Comments'];
  newStudentsContextMenuOptions: DetailedSettings = {
    items: {
      row_above: {},
      row_below: {},
      remove_row: {},
      undo: {},
      redo: {},
      cut: {},
      copy: {},
      paste: {
        key: 'paste',
        name: 'Paste',
        callback: this.pasteClick,
      },
      make_read_only: {},
      alignment: {},
    },
  };

  existingStudentsContextMenuOptions: DetailedSettings = {
    items: {
      modify: {
        name: 'Modify',
        hidden() {
          return this?.getSelectedLast()![1] === 3; // cannot edit email
        },
        callback(_, selection) {
          const data = this.getDataAtRow(selection[0].start.row);
          for (let i = 0; i < data.length; i++) {
            if (i === 3) continue; // cannot edit email
            this.setCellMeta(selection[0].start.row, i, 'readOnly', false);
          }
          this.selectCell(selection[0].start.row, selection[0].start.col);
        },
      },
    },
  };

  hotRegisterer: HotTableRegisterer = new HotTableRegisterer();
  newStudentsHOT: string = 'newStudentsHOT';
  existingStudentsHOT: string = 'existingStudentsHOT';

  enrollResultPanelList?: EnrollResultPanel[];
  existingStudents: Student[] = [];

  isExistingStudentsPresent: boolean = true;
  hasLoadingStudentsFailed: boolean = false;
  isLoadingExistingStudents: boolean = false;
  isAjaxSuccess: boolean = true;
  isEnrolling: boolean = false;

  allStudentChunks: StudentEnrollRequest[][] = [];
  invalidRowsIndex: Set<number> = new Set();
  newStudentRowsIndex: Set<number> = new Set();
  modifiedStudentRowsIndex: Set<number> = new Set();
  unchangedStudentRowsIndex: Set<number> = new Set();
  numberOfStudentsPerRequest: number = 50; // at most 50 students per chunk

  modifiedStudents: Map<number, StudentEnrollRequest> = new Map();
  isModifying = false;

  constructor(
    private route: ActivatedRoute,
    private statusMessageService: StatusMessageService,
    private courseService: CourseService,
    private studentService: StudentService,
    private progressBarService: ProgressBarService,
    private simpleModalService: SimpleModalService,
    private pageScrollService: PageScrollService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((queryParams: any) => {
      this.courseId = queryParams.courseid;
      this.getCourseEnrollPageData(queryParams.courseid);
    });
  }

  submitModifiedData(): void {
    this.prepareForSubmission(this.existingStudentsHOT, false);

    if (this.modifiedStudents.size === 0) {
      this.errorMessage = 'Please select a student to modify.';
      this.isEnrolling = false;
      return;
    }

    this.checkDataFields(this.modifiedStudents);

    if (this.invalidRowsIndex.size > 0) {
      this.setTableStyleBasedOnFieldChecks(
        this.hotRegisterer.getInstance(this.existingStudentsHOT)
      );
      this.isEnrolling = false;
      return;
    }

    this.partitionStudentEnrollRequests(
      Array.from(this.modifiedStudents.values())
    );

    this.processEnrollRequests(
      this.modifiedStudents,
      this.existingStudentsHOT,
      'Modification successful. Summary given below.'
    );
  }

  submitEnrollData(): void {
    this.prepareForSubmission(this.newStudentsHOT);

    const studentEnrollRequests: Map<number, StudentEnrollRequest> =
      this.parseUserInput(this.hotRegisterer, this.newStudentsHOT);

    if (studentEnrollRequests.size === 0) {
      this.errorMessage = 'Empty table';
      this.isEnrolling = false;
      return;
    }

    this.checkDataFields(studentEnrollRequests);

    if (this.invalidRowsIndex.size > 0) {
      this.setTableStyleBasedOnFieldChecks(
        this.hotRegisterer.getInstance(this.newStudentsHOT)
      );
      this.isEnrolling = false;
      return;
    }

    this.partitionStudentEnrollRequests(
      Array.from(studentEnrollRequests.values())
    );

    this.processEnrollRequests(studentEnrollRequests, this.newStudentsHOT);
  }

  prepareForSubmission(hot: string, reset: boolean = true): void {
    this.isEnrolling = true;
    this.isModifying = false;

    // reset global variables
    this.errorMessage = '';
    this.allStudentChunks = [];
    this.invalidRowsIndex = new Set();
    this.newStudentRowsIndex = new Set();
    this.modifiedStudentRowsIndex = new Set();
    this.unchangedStudentRowsIndex = new Set();

    const hotInstance: Handsontable = this.hotRegisterer.getInstance(hot);

    reset && this.resetTableStyle(hotInstance);
  }

  getHotInstanceColHeaders(hotInstance: Handsontable): string[] {
    return hotInstance.getColHeader() as string[];
  }

  checkDataFields(
    studentEnrollRequests: Map<number, StudentEnrollRequest>
  ): void {
    this.checkCompulsoryFields(studentEnrollRequests);
    this.checkEmailNotRepeated(studentEnrollRequests);
    this.checkTeamsValid(studentEnrollRequests);
  }

  processEnrollRequests(
    studentEnrollRequests: Map<number, StudentEnrollRequest>,
    hot: string,
    message: string = 'Enrollment successful. Summary given below.'
  ): void {
    const students: Student[] = [];

    // cannot use fork-join because the requests are dependent
    const enrollRequests: Observable<EnrollStudents> = concat(
      ...this.allStudentChunks.map((studentChunk: StudentEnrollRequest[]) => {
        const request: StudentsEnrollRequest = {
          studentEnrollRequests: studentChunk,
        };
        return this.studentService.enrollStudents(this.courseId, request);
      })
    );

    this.progressBarService.updateProgress(0);

    enrollRequests
      .pipe(
        finalize(() => {
          this.isEnrolling = false;
        })
      )
      .subscribe({
        next: (resp: EnrollStudents) => {
          students.push(...resp.studentsData.students);

          if (resp.unsuccessfulEnrolls != null) {
            for (const unsuccessfulEnroll of resp.unsuccessfulEnrolls) {
              this.unsuccessfulEnrolls[unsuccessfulEnroll.studentEmail] =
                unsuccessfulEnroll.errorMessage;

              for (const index of studentEnrollRequests.keys()) {
                if (
                  studentEnrollRequests.get(index)?.email ===
                  unsuccessfulEnroll.studentEmail
                ) {
                  this.invalidRowsIndex.add(index);
                  break;
                }
              }
            }
          }

          const percentage: number = Math.round(
            (100 * students.length) / studentEnrollRequests.size
          );
          this.progressBarService.updateProgress(percentage);
        },
        complete: () => {
          this.showEnrollResults = true;
          this.statusMessage.pop();
          this.statusMessageService.showSuccessToast(message);
          this.prepareEnrollmentResults(students, studentEnrollRequests);

          if (
            this.invalidRowsIndex.size > 0 ||
            this.newStudentRowsIndex.size > 0 ||
            this.modifiedStudentRowsIndex.size > 0 ||
            this.unchangedStudentRowsIndex.size > 0
          ) {
            this.setTableStyleBasedOnFieldChecks(
              this.hotRegisterer.getInstance(hot)
            );
          }
        },
        error: (resp: ErrorMessageOutput) => {
          if (students.length > 0) {
            this.showEnrollResults = true;
            this.prepareEnrollmentResults(students, studentEnrollRequests);
          }

          this.errorMessage = resp.error.message;
        },
      });
  }

  parseUserInput(
    hotRegisterer: HotTableRegisterer,
    hot: string
  ): Map<number, StudentEnrollRequest> {
    const studentEnrollRequests: Map<number, StudentEnrollRequest> = new Map();
    const hotInstanceColHeaders: string[] = this.getHotInstanceColHeaders(
      hotRegisterer.getInstance(hot)
    );

    hotRegisterer
      .getInstance(hot)
      .getData()
      .forEach((row: string[], index: number) => {
        if (!row.every((cell: string) => cell === null || cell === '')) {
          studentEnrollRequests.set(index, {
            section:
              row[hotInstanceColHeaders.indexOf(this.colHeaders[0])] === null
                ? ''
                : row[hotInstanceColHeaders.indexOf(this.colHeaders[0])].trim(),
            team:
              row[hotInstanceColHeaders.indexOf(this.colHeaders[1])] === null
                ? ''
                : row[hotInstanceColHeaders.indexOf(this.colHeaders[1])].trim(),
            name:
              row[hotInstanceColHeaders.indexOf(this.colHeaders[2])] === null
                ? ''
                : row[hotInstanceColHeaders.indexOf(this.colHeaders[2])].trim(),
            email:
              row[hotInstanceColHeaders.indexOf(this.colHeaders[3])] === null
                ? ''
                : row[hotInstanceColHeaders.indexOf(this.colHeaders[3])].trim(),
            comments:
              row[hotInstanceColHeaders.indexOf(this.colHeaders[4])] === null
                ? ''
                : row[hotInstanceColHeaders.indexOf(this.colHeaders[4])].trim(),
          });
        }
      });

    return studentEnrollRequests;
  }

  private prepareEnrollmentResults(
    enrolledStudents: Student[],
    studentEnrollRequests: Map<number, StudentEnrollRequest>
  ): void {
    this.enrollResultPanelList = this.populateEnrollResultPanelList(
      enrolledStudents,
      studentEnrollRequests
    );

    this.studentService
      .getStudentsFromCourse({ courseId: this.courseId })
      .subscribe((resp: Students) => {
        this.existingStudents = resp.students;
        if (!this.isExistingStudentsPanelCollapsed) {
          const existingStudentTable: Handsontable =
            this.hotRegisterer.getInstance(this.existingStudentsHOT);
          this.loadExistingStudentsData(
            existingStudentTable,
            this.existingStudents
          );
        }
        this.isExistingStudentsPresent = true;
      });
  }

  private partitionStudentEnrollRequests(
    studentEnrollRequests: StudentEnrollRequest[]
  ): void {
    let currentStudentChunk: StudentEnrollRequest[] = [];
    for (const request of studentEnrollRequests) {
      currentStudentChunk.push(request);
      if (currentStudentChunk.length >= this.numberOfStudentsPerRequest) {
        this.allStudentChunks.push(currentStudentChunk);
        currentStudentChunk = [];
      }
    }
    if (currentStudentChunk.length > 0) {
      this.allStudentChunks.push(currentStudentChunk);
    }
  }

  private checkTeamsValid(
    studentEnrollRequests: Map<number, StudentEnrollRequest>
  ): void {
    const teamSectionMap: Map<string, string> = new Map();
    const teamIndexMap: Map<string, number> = new Map();
    const invalidRowsOriginalSize: number = this.invalidRowsIndex.size;

    Array.from(studentEnrollRequests.keys()).forEach((key: number) => {
      const request: StudentEnrollRequest | undefined =
        studentEnrollRequests.get(key);
      if (request === undefined) {
        return;
      }

      if (!teamSectionMap.has(request.team)) {
        teamSectionMap.set(request.team, request.section);
        teamIndexMap.set(request.team, key);
        return;
      }

      if (teamSectionMap.get(request.team) !== request.section) {
        this.invalidRowsIndex.add(key);
        const firstIndex: number | undefined = teamIndexMap.get(request.team);
        if (firstIndex !== undefined) {
          this.invalidRowsIndex.add(firstIndex);
        }
      }
    });
    if (this.invalidRowsIndex.size > invalidRowsOriginalSize) {
      this.errorMessage += 'Found duplicated teams in different sections. ';
    }
  }

  private checkCompulsoryFields(
    studentEnrollRequests: Map<number, StudentEnrollRequest>
  ): void {
    const invalidRowsOriginalSize: number = this.invalidRowsIndex.size;

    Array.from(studentEnrollRequests.keys()).forEach((key: number) => {
      const request: StudentEnrollRequest | undefined =
        studentEnrollRequests.get(key);
      if (request === undefined) {
        return;
      }

      if (
        (studentEnrollRequests.size >= 100 && request.section === '') ||
        request.team === '' ||
        request.name === '' ||
        request.email === ''
      ) {
        this.invalidRowsIndex.add(key);
      }
    });
    if (this.invalidRowsIndex.size > invalidRowsOriginalSize) {
      this.errorMessage +=
        'Found empty compulsory fields and/or sections with more than 100 students. ';
    }
  }

  private checkEmailNotRepeated(
    studentEnrollRequests: Map<number, StudentEnrollRequest>
  ): void {
    const emailMap: Map<string, number> = new Map();
    const invalidRowsOriginalSize: number = this.invalidRowsIndex.size;

    Array.from(studentEnrollRequests.keys()).forEach((key: number) => {
      const request: StudentEnrollRequest | undefined =
        studentEnrollRequests.get(key);
      if (request === undefined) {
        return;
      }

      if (!emailMap.has(request.email)) {
        emailMap.set(request.email, key);
        return;
      }

      this.invalidRowsIndex.add(key);
      const firstIndex: number | undefined = emailMap.get(request.email);
      if (firstIndex !== undefined) {
        this.invalidRowsIndex.add(firstIndex);
      }
    });
    if (this.invalidRowsIndex.size > invalidRowsOriginalSize) {
      this.errorMessage += 'Found duplicated emails. ';
    }
  }

  private resetTableStyle(hotInstance: Handsontable): void {
    for (let row = 0; row <= hotInstance.getData().length; row += 1) {
      for (let col = 0; col <= hotInstance.getData()[0].length; col += 1) {
        hotInstance.setCellMeta(row, col, 'className', 'valid-row');
      }
    }
    hotInstance.render();
  }

  private setTableStyleBasedOnFieldChecks(
    newStudentsHOTInstance: Handsontable
  ): void {
    this.setRowStyle(
      this.invalidRowsIndex,
      'invalid-row',
      newStudentsHOTInstance
    );
    this.setRowStyle(
      this.newStudentRowsIndex,
      'new-row',
      newStudentsHOTInstance
    );
    this.setRowStyle(
      this.modifiedStudentRowsIndex,
      'modified-row',
      newStudentsHOTInstance
    );
    this.setRowStyle(
      this.unchangedStudentRowsIndex,
      'unchanged-row',
      newStudentsHOTInstance
    );

    newStudentsHOTInstance.render();
  }

  private setRowStyle(
    rowsIndex: Set<number>,
    style: string,
    studentsHOTInstance: Handsontable
  ): void {
    for (const index of rowsIndex) {
      for (let i = 0; i < studentsHOTInstance.getDataAtRow(index).length; i++) {
        studentsHOTInstance.setCellMeta(index, i, 'className', style);
      }
    }
  }

  private populateEnrollResultPanelList(
    enrolledStudents: Student[],
    requests: Map<number, StudentEnrollRequest>
  ): EnrollResultPanel[] {
    const panels: EnrollResultPanel[] = [];
    const studentLists: Student[][] = [];
    const statuses: (string | EnrollStatus)[] = Object.values(
      EnrollStatus
    ).filter((value: string | EnrollStatus) => typeof value === 'string');

    for (let i = 0; i < statuses.length; i += 1) {
      studentLists.push([]);
    }

    const emailToIndexMap: Map<string, number> = new Map();
    requests.forEach((enrollRequest: StudentEnrollRequest, index: number) => {
      emailToIndexMap.set(enrollRequest.email, index);
    });

    // Identify students not in the enroll list.
    for (const existingStudent of this.existingStudents) {
      const enrolledStudent: Student | undefined = enrolledStudents.find(
        (student: Student) => {
          return student.email === existingStudent.email;
        }
      );
      if (enrolledStudent === undefined) {
        studentLists[EnrollStatus.UNMODIFIED].push(existingStudent);
      }
    }

    // Identify new students, modified students, and students that are modified without any changes.
    for (const enrolledStudent of enrolledStudents) {
      const unchangedStudent: Student | undefined = this.existingStudents.find(
        (student: Student) => {
          return this.isSameEnrollInformation(student, enrolledStudent);
        }
      );
      const modifiedStudent: Student | undefined = this.existingStudents.find(
        (student: Student) => {
          return student.email === enrolledStudent.email;
        }
      );

      if (unchangedStudent !== undefined) {
        studentLists[EnrollStatus.MODIFIED_UNCHANGED].push(enrolledStudent);
        this.addToRowsIndexSet(
          enrolledStudent.email,
          emailToIndexMap,
          this.unchangedStudentRowsIndex
        );
      } else if (
        unchangedStudent === undefined &&
        modifiedStudent !== undefined
      ) {
        studentLists[EnrollStatus.MODIFIED].push(enrolledStudent);
        this.addToRowsIndexSet(
          enrolledStudent.email,
          emailToIndexMap,
          this.modifiedStudentRowsIndex
        );
      } else if (
        unchangedStudent === undefined &&
        modifiedStudent === undefined
      ) {
        studentLists[EnrollStatus.NEW].push(enrolledStudent);
        this.addToRowsIndexSet(
          enrolledStudent.email,
          emailToIndexMap,
          this.newStudentRowsIndex
        );
      }
    }

    // Identify students that failed to enroll.
    for (const request of requests.values()) {
      const enrolledStudent: Student | undefined = enrolledStudents.find(
        (student: Student) => {
          return student.email === request.email;
        }
      );

      if (enrolledStudent === undefined) {
        studentLists[EnrollStatus.ERROR].push({
          email: request.email,
          courseId: this.courseId,
          name: request.name,
          sectionName: request.section,
          teamName: request.team,
          comments: request.comments,
          joinState: JoinState.NOT_JOINED,
        });
      }
    }

    const statusMessage: Record<number, string> = {
      0: `${
        studentLists[EnrollStatus.ERROR].length
      } student(s) failed to be enrolled:`,
      1: `${studentLists[EnrollStatus.NEW].length} student(s) added:`,
      2: `${studentLists[EnrollStatus.MODIFIED].length} student(s) modified:`,
      3: `${
        studentLists[EnrollStatus.MODIFIED_UNCHANGED].length
      } student(s) updated with no changes:`,
      4: `${
        studentLists[EnrollStatus.UNMODIFIED].length
      } student(s) remain unmodified:`,
    };

    for (const status of statuses) {
      panels.push({
        status: EnrollStatus[status as keyof typeof EnrollStatus],
        messageForEnrollmentStatus:
          statusMessage[EnrollStatus[status as keyof typeof EnrollStatus]],
        studentList:
          studentLists[EnrollStatus[status as keyof typeof EnrollStatus]],
      });
    }

    if (studentLists[EnrollStatus.ERROR].length > 0) {
      this.errorMessage = this.GENERAL_ERROR_MESSAGE;
      this.statusMessageService.showErrorToast(
        'Some students failed to be enrolled, see the summary below.'
      );
    }
    return panels;
  }

  private addToRowsIndexSet(
    email: string,
    emailToIndexMap: Map<string, number>,
    rowsIndex: Set<number>
  ): void {
    const index: number | undefined = emailToIndexMap.get(email);
    if (index !== undefined) {
      rowsIndex.add(index);
    }
  }

  private isSameEnrollInformation(
    enrolledStudent: Student,
    existingStudent: Student
  ): boolean {
    return (
      enrolledStudent.email === existingStudent.email &&
      enrolledStudent.name === existingStudent.name &&
      enrolledStudent.teamName === existingStudent.teamName &&
      enrolledStudent.sectionName === existingStudent.sectionName &&
      enrolledStudent.comments === existingStudent.comments
    );
  }

  /**
   * Adds new rows to the 'New students' spreadsheet interface
   * according to user input
   */
  addRows(numOfRows: number): void {
    this.hotRegisterer
      .getInstance(this.newStudentsHOT)
      .alter('insert_row_below', [], numOfRows);
  }

  /**
   * Toggles the view of 'New Students' spreadsheet interface
   * and/or its affiliated buttons
   */
  toggleNewStudentsPanel(): void {
    this.isNewStudentsPanelCollapsed = !this.isNewStudentsPanelCollapsed;
  }

  /**
   * Returns the length of the current spreadsheet.
   * Rows with all null values are filtered.
   */
  getSpreadsheetLength(dataHandsontable: string[][]): number {
    return dataHandsontable.filter(
      (row: string[]) => !row.every((cell: string) => cell === null)
    ).length;
  }

  /**
   * Transforms the first uppercase letter of a string into a lowercase letter.
   */
  unCapitalizeFirstLetter(targetString: string): string {
    return targetString.charAt(0).toLowerCase() + targetString.slice(1);
  }

  /**
   * Converts returned student list to a suitable format required by Handsontable.
   */
  studentListDataToHandsontableData(
    studentsData: Student[],
    handsontableColHeader: any[]
  ): string[][] {
    const headers: string[] = handsontableColHeader.map(
      this.unCapitalizeFirstLetter
    );
    return studentsData.map((student: Student) =>
      headers.map((header: string) => {
        if (header === 'team') {
          return student.teamName!;
        }
        if (header === 'section') {
          return student.sectionName!;
        }
        return student[header as keyof Student]!;
      })
    );
  }

  /**
   * Loads existing student data into the spreadsheet interface.
   */
  loadExistingStudentsData(
    existingStudentsHOTInstance: Handsontable,
    studentsData: Student[]
  ): void {
    existingStudentsHOTInstance.loadData(
      this.studentListDataToHandsontableData(
        studentsData,
        existingStudentsHOTInstance.getColHeader() as any[]
      )
    );
  }

  /**
   * Toggles the view of 'Existing Students' spreadsheet interface
   */
  toggleExistingStudentsPanel(): void {
    // Has to be done before the API call is made so that HOT is available for data population
    this.isExistingStudentsPanelCollapsed =
      !this.isExistingStudentsPanelCollapsed;
    this.isLoadingExistingStudents = true;
    const existingStudentsHOTInstance: Handsontable =
      this.hotRegisterer.getInstance(this.existingStudentsHOT);

    // Calling REST API only the first time when spreadsheet has no data
    if (
      this.getSpreadsheetLength(existingStudentsHOTInstance.getData()) !== 0
    ) {
      this.isLoadingExistingStudents = false;
      return;
    }

    existingStudentsHOTInstance.addHook(
      'afterSetDataAtCell',
      (changes: any[]) => {
        const currVal: string = changes[0][2];
        const newVal: string = changes[0][3];
        if (currVal !== newVal) {
          for (
            let i = 0;
            i < existingStudentsHOTInstance.getColHeader().length;
            i++
          ) {
            existingStudentsHOTInstance.setCellMeta(
              changes[0][0],
              i,
              'className',
              'modified-row'
            );
            this.modifiedStudentRowsIndex.add(changes[0][0]);
          }

          const data: string[] = existingStudentsHOTInstance.getDataAtRow(
            changes[0][0]
          );
          data[changes[0][1]] = newVal;

          const req: StudentEnrollRequest = {
            section: data[0] === null ? '' : data[0].trim(),
            team: data[1] === null ? '' : data[1].trim(),
            name: data[2] === null ? '' : data[2].trim(),
            email: data[3] === null ? '' : data[3].trim(),
            comments: data[4] === null ? '' : data[4].trim(),
          };
          this.modifiedStudents.set(changes[0][0], req);
          this.isModifying = true;
        }
      }
    );

    this.studentService
      .getStudentsFromCourse({ courseId: this.courseId })
      .subscribe({
        next: (resp: Students) => {
          if (resp.students.length) {
            this.loadExistingStudentsData(
              existingStudentsHOTInstance,
              resp.students
            );
          } else {
            // Shows a message if there are no existing students. Panel would not be expanded.
            this.isExistingStudentsPresent = false;
            this.isExistingStudentsPanelCollapsed =
              !this.isExistingStudentsPanelCollapsed; // Collapse the panel again
          }
        },
        error: (resp: ErrorMessageOutput) => {
          this.statusMessageService.showErrorToast(resp.error.message);
          this.isAjaxSuccess = false;
          this.isExistingStudentsPanelCollapsed =
            !this.isExistingStudentsPanelCollapsed; // Collapse the panel again
        },
        complete: () => {
          this.isLoadingExistingStudents = false;
        },
      });
  }

  /**
   * Trigger click button
   */
  pasteClick(): void {
    const element: HTMLElement = document.getElementById(
      'paste'
    ) as HTMLElement;
    element.click();
  }

  /**
   * Shows modal box when user clicks on the 'paste' option in the
   * Handsontable context menu
   */
  showPasteModalBox(): void {
    const modalContent: string = `Pasting data through the context menu is not supported due to browser restrictions.<br>
      Please use <kbd>Ctrl + V</kbd> or <kbd>⌘ + V</kbd> to paste your data instead.`;
    this.simpleModalService.openInformationModal(
      'Pasting data through the context menu',
      SimpleModalType.WARNING,
      modalContent
    );
  }

  /**
   * Checks whether the course is present
   */
  getCourseEnrollPageData(courseid: string): void {
    this.existingStudents = [];
    this.hasLoadingStudentsFailed = false;
    this.isLoadingCourseEnrollPage = true;
    this.courseService.hasResponsesForCourse(courseid).subscribe({
      next: (resp: HasResponses) => {
        this.coursePresent = true;
        this.courseId = courseid;
        if (resp.hasResponsesBySession === undefined) {
          return;
        }
        for (const sessionName of Object.keys(resp.hasResponsesBySession)) {
          if (resp.hasResponsesBySession[sessionName]) {
            const modalContent: string = `<p><strong>There are existing feedback responses for this course.</strong></p>
          Modifying records of enrolled students will result in some existing responses
          from those modified students to be deleted. You may wish to download the data
          before you make the changes.`;
            this.simpleModalService.openInformationModal(
              'Existing feedback responses',
              SimpleModalType.WARNING,
              modalContent
            );
          }
        }
      },
      error: (resp: ErrorMessageOutput) => {
        this.coursePresent = false;
        this.statusMessageService.showErrorToast(resp.error.message);
      },
      complete: () => {
        this.isLoadingCourseEnrollPage = false;
      },
    });
    this.studentService
      .getStudentsFromCourse({ courseId: courseid })
      .subscribe({
        next: (resp: Students) => {
          this.existingStudents = resp.students;
        },
        error: (resp: ErrorMessageOutput) => {
          this.hasLoadingStudentsFailed = true;
          this.statusMessageService.showErrorToast(resp.error.message);
        },
      });
  }

  /**
   * Scrolls user to the target section.
   */
  navigateTo(target: string): void {
    this.pageScrollService.scroll({
      document: this.document,
      duration: 500,
      scrollTarget: `#${target}`,
      scrollOffset: 70,
    });
  }
}
