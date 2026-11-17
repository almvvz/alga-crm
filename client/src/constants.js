export const PRODUCTS = ["Intensive", "Duo", "1-on-1 single", "1-on-1 pack", "Solo after duo"];
export const FORMATS = [...PRODUCTS, "Open review"];
export const STUDENT_STATUSES = ["Active", "Finished", "Left with partial refund", "100% refund"];
export const LESSON_STATUSES = [
  "Scheduled", "Held", "Rescheduled (notice given)", "Student cancelled >=24h",
  "Student cancelled <24h (lesson burned)", "No-show (rescheduled)", "Tutor cancelled",
];
export const ENTRY_TYPES = ["Student payment", "Student refund", "Tutor payout", "Expense", "Other income", "Partner transfer"];
export const METHODS = ["Transfer", "E-wallet", "Cash"];
export const TUTOR_STATUSES = ["Candidate", "Active", "On hold", "Finished"];
export const MAX_STUDENTS = { Duo: 2, "1-on-1 single": 1, "1-on-1 pack": 1, "Solo after duo": 1 };
