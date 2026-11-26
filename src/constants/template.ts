export const LEGACY_DEFAULT_TEMPLATE = `Good evening, teachers.

Please be reminded that the following teacher(s) are on duty for the coming week:

{TEACHERS}

Duty period: {START_DATE} - {END_DATE}

Kindly ensure you are present and punctual for all assemblies, breaks, and dismissal duties. Let us know if you need any adjustments in advance.

Thank you for your dedication!`;

export const V2_DEFAULT_TEMPLATE = `📢 WEEKLY TEACHER DUTY ANNOUNCEMENT
🗓️ {WEEK}
📅 Period: {START_DATE} – {END_DATE}

Good evening, Staff.
The following teachers are on duty for the week:

{TEACHERS}

Kindly ensure full supervision and punctuality for assembly, break periods, dining hall, and closing duties. Let administration know early if any adjustment is needed.

Thank you for your dedication!
— Senior Houseparent, OLAG SHS`;

export const PREVIOUS_DEFAULT_TEMPLATES = [
  LEGACY_DEFAULT_TEMPLATE,
  V2_DEFAULT_TEMPLATE
];

export const DEFAULT_TEMPLATE = `ATTENTION! ATTENTION! ATTENTION!
Masters/Mistresses On Duty For {WEEK}

(From {START_DATE} To {END_DATE})

{TEACHERS}

Kindly take note: *Tuesday is GENERAL CLEANING.* FORM MASTERS, MASTERS & MISTRESSES ON DUTY SHOULD KINDLY TAKE NOTE.

🙏🏾Thank you



DUTIES/RESPONSIBILITIES:
- *Supervision of work on the compound*
- *Ensuring students discipline*
- *Supervision of dining Session*
- *Identifying and punishing latecomers*
- *Making sure students are in their classroom during classes time*
- *making sure students (patients) take their drugs from the sick bay*
•*Writing names of offenders in the punishment book for punishment on Tuesday*
- *Writing Names of students who refuse to eat and those who don’t use the appropriate set of cutlery for punishment*
- *Writing reports on activities during period of duty.*



N/B
- Team Leader is to contact Senior/assistant senior house tutor for report form.
- Team Leader is to ensure that names of teachers who perform the duty are written on the report form.
- Your commitment and cooperation will be highly anticipated.
•Failure to attend to your duties requires sanction from management.`;
