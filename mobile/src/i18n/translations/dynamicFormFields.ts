/**
 * Client-side static translation mapping for `form_template_fields.label` and
 * its `options` enum values (backend/db/seeds/seedFormTemplates.js) — the DB
 * itself stores only plain English text with no locale column, and this pass
 * deliberately does not touch the backend/DB (too risky without a real
 * device/migration test cycle, per the step's own scope). Built from the
 * exhaustive, real `FIELD_SETS` in that seed file (read directly, not
 * guessed) — every `fieldKey` across general/infrastructure/health/education,
 * and every distinct `select`/`multiselect` option value they use.
 *
 * Lookups fall back to the raw DB string when a key isn't found here (never
 * crash/blank out on an unmapped field — matches this codebase's established
 * "degrade gracefully" pattern, e.g. registerForPushNotifications.ts).
 */
import type { SupportedLanguage } from '../languages';

type Translated = Record<SupportedLanguage, string>;

/** Every `fieldKey` seedFormTemplates.js defines, across all 4 sector field sets. */
export const FIELD_LABELS: Record<string, Translated> = {
  // general
  site_condition: { en: 'Overall site condition', ur: 'مجموعی سائٹ کی حالت', sd: 'مجموعي سائيٽ جي حالت' },
  work_progress_summary: { en: 'Work progress summary', ur: 'کام کی پیش رفت کا خلاصہ', sd: 'ڪم جي ترقي جو خلاصو' },
  delay_reason: { en: 'Reason for delay', ur: 'تاخیر کی وجہ', sd: 'دير جو سبب' },
  requires_intervention: { en: 'Requires management intervention', ur: 'انتظامی مداخلت درکار ہے', sd: 'انتظامي مداخلت گهربل آهي' },
  // infrastructure
  project_type: { en: 'Project type', ur: 'منصوبے کی قسم', sd: 'پروجيڪٽ جو قسم' },
  work_stage: { en: 'Current work stage', ur: 'کام کا موجودہ مرحلہ', sd: 'ڪم جو موجوده مرحلو' },
  work_quality: { en: 'Observed work quality', ur: 'مشاہدہ شدہ کام کا معیار', sd: 'مشاهدو ڪيل ڪم جو معيار' },
  safety_compliance: { en: 'Safety requirements are being followed', ur: 'حفاظتی تقاضوں پر عمل کیا جا رہا ہے', sd: 'حفاظتي گهرجن تي عمل ڪيو پيو وڃي' },
  materials_available: { en: 'Required materials are available', ur: 'مطلوبہ سامان دستیاب ہے', sd: 'گهربل سامان موجود آهي' },
  labor_on_site: { en: 'Workers present on site', ur: 'سائٹ پر موجود مزدور', sd: 'سائيٽ تي موجود مزدور' },
  estimated_completion_date: { en: 'Estimated completion date', ur: 'تکمیل کی متوقع تاریخ', sd: 'پڄاڻي جي اندازي تاريخ' },
  site_access_clear: { en: 'Site access is clear for workers and equipment', ur: 'مزدوروں اور آلات کے لیے سائٹ تک رسائی صاف ہے', sd: 'مزدورن ۽ سامان لاءِ سائيٽ تائين رسائي صاف آهي' },
  environmental_safeguards: { en: 'Environmental safeguards are in place', ur: 'ماحولیاتی تحفظات موجود ہیں', sd: 'ماحولياتي حفاظتون موجود آهن' },
  measurement_verified: { en: 'Reported work quantities were verified on site', ur: 'رپورٹ شدہ مقدارِ کام کی سائٹ پر تصدیق کی گئی', sd: 'رپورٽ ٿيل ڪم جي مقدار سائيٽ تي تصديق ٿي وئي' },
  infrastructure_issues: { en: 'Infrastructure issues observed', ur: 'مشاہدہ شدہ بنیادی ڈھانچے کے مسائل', sd: 'مشاهدو ڪيل بنيادي ڍانچي جا مسئلا' },
  // health
  facility_type: { en: 'Facility type', ur: 'سہولت کی قسم', sd: 'سهولت جو قسم' },
  facility_functional: { en: 'Facility is operational', ur: 'سہولت فعال ہے', sd: 'سهولت هلندڙ آهي' },
  staff_present: { en: 'Staff present during visit', ur: 'وزٹ کے دوران موجود عملہ', sd: 'ورزٽ دوران موجود عملو' },
  essential_services_available: { en: 'Essential services available', ur: 'ضروری خدمات دستیاب', sd: 'لازمي خدمتون موجود' },
  medicine_stock_available: { en: 'Essential medicines are available', ur: 'ضروری ادویات دستیاب ہیں', sd: 'لازمي دوائون موجود آهن' },
  equipment_functional: { en: 'Key equipment is functional', ur: 'اہم آلات فعال ہیں', sd: 'اهم سامان هلندڙ آهي' },
  sanitation_condition: { en: 'Sanitation condition', ur: 'صفائی کی حالت', sd: 'صفائي جي حالت' },
  medical_waste_managed: { en: 'Medical waste is managed safely', ur: 'طبی فضلہ محفوظ طریقے سے ٹھکانے لگایا جاتا ہے', sd: 'طبي ڪچرو محفوظ طريقي سان منظم ڪيو ويندو آهي' },
  patient_load_observed: { en: 'Approximate patients served during visit', ur: 'وزٹ کے دوران دیکھے گئے مریضوں کی تخمینی تعداد', sd: 'ورزٽ دوران ڏٺل مريضن جو اندازي تعداد' },
  service_delivery_issues: { en: 'Service delivery issues observed', ur: 'مشاہدہ شدہ خدمات کی فراہمی کے مسائل', sd: 'مشاهدو ڪيل خدمتن جي فراهمي جا مسئلا' },
  // education
  school_type: { en: 'School type', ur: 'اسکول کی قسم', sd: 'اسڪول جو قسم' },
  school_functional: { en: 'School is operational', ur: 'اسکول فعال ہے', sd: 'اسڪول هلندڙ آهي' },
  student_enrollment: { en: 'Enrolled students', ur: 'داخلہ شدہ طلبہ', sd: 'داخل ٿيل شاگرد' },
  teachers_present: { en: 'Teachers present during visit', ur: 'وزٹ کے دوران موجود اساتذہ', sd: 'ورزٽ دوران موجود استاد' },
  classrooms_usable: { en: 'Usable classrooms', ur: 'قابل استعمال کمرہ جماعت', sd: 'قابل استعمال ڪلاس روم' },
  water_available: { en: 'Safe drinking water is available', ur: 'صاف پینے کا پانی دستیاب ہے', sd: 'صاف پيئڻ جو پاڻي موجود آهي' },
  sanitation_available: { en: 'Usable sanitation facilities are available', ur: 'قابل استعمال بیت الخلاء کی سہولیات دستیاب ہیں', sd: 'قابل استعمال بيت الخلا جون سهولتون موجود آهن' },
  electricity_available: { en: 'Electricity is available', ur: 'بجلی دستیاب ہے', sd: 'بجلي موجود آهي' },
  learning_materials_available: { en: 'Learning materials are available', ur: 'تدریسی مواد دستیاب ہے', sd: 'سکيا جو مواد موجود آهي' },
  building_safe_for_students: { en: 'Building appears safe for students', ur: 'عمارت طلبہ کے لیے محفوظ معلوم ہوتی ہے', sd: 'عمارت شاگردن لاءِ محفوظ ڏسجي ٿي' },
  attendance_rate_pct: { en: 'Approximate student attendance (%)', ur: 'طلبہ کی تخمینی حاضری (%)', sd: 'شاگردن جي اندازي حاضري (%)' },
  education_issues: { en: 'Education issues observed', ur: 'مشاہدہ شدہ تعلیمی مسائل', sd: 'مشاهدو ڪيل تعليمي مسئلا' },
};

/**
 * Every distinct `select`/`multiselect` option value across all 4 field
 * sets. Values like GOOD/OTHER are reused verbatim across fields in the seed
 * data, so this is one flat map keyed by the raw enum value, not per-field.
 */
export const OPTION_LABELS: Record<string, Translated> = {
  // site_condition
  EXCELLENT: { en: 'Excellent', ur: 'بہترین', sd: 'بهترين' },
  GOOD: { en: 'Good', ur: 'اچھا', sd: 'سٺو' },
  FAIR: { en: 'Fair', ur: 'مناسب', sd: 'مناسب' },
  POOR: { en: 'Poor', ur: 'ناقص', sd: 'خراب' },
  CRITICAL: { en: 'Critical', ur: 'تشویشناک', sd: 'نازڪ' },
  // project_type
  ROAD: { en: 'Road', ur: 'سڑک', sd: 'روڊ' },
  BUILDING: { en: 'Building', ur: 'عمارت', sd: 'عمارت' },
  WATER_SUPPLY: { en: 'Water supply', ur: 'پانی کی فراہمی', sd: 'پاڻي جي فراهمي' },
  DRAINAGE: { en: 'Drainage', ur: 'نکاسیِ آب', sd: 'پاڻي جي نيڪالي' },
  IRRIGATION: { en: 'Irrigation', ur: 'آبپاشی', sd: 'آبپاشي' },
  ENERGY: { en: 'Energy', ur: 'توانائی', sd: 'توانائي' },
  OTHER: { en: 'Other', ur: 'دیگر', sd: 'ٻيو' },
  // work_stage
  NOT_STARTED: { en: 'Not started', ur: 'شروع نہیں ہوا', sd: 'شروع نه ٿيل' },
  FOUNDATION: { en: 'Foundation', ur: 'بنیاد', sd: 'بنياد' },
  STRUCTURE: { en: 'Structure', ur: 'ڈھانچہ', sd: 'جوڙجڪ' },
  FINISHING: { en: 'Finishing', ur: 'تکمیلی کام', sd: 'پڄاڻي جو ڪم' },
  COMMISSIONING: { en: 'Commissioning', ur: 'آغازِ کار', sd: 'ڪم شروع ڪرائڻ' },
  COMPLETED: { en: 'Completed', ur: 'مکمل', sd: 'مڪمل' },
  // work_quality / sanitation_condition
  ACCEPTABLE: { en: 'Acceptable', ur: 'قابل قبول', sd: 'قابل قبول' },
  NOT_ASSESSED: { en: 'Not assessed', ur: 'جانچا نہیں گیا', sd: 'جاچيو نه ويو' },
  UNAVAILABLE: { en: 'Unavailable', ur: 'دستیاب نہیں', sd: 'موجود ناهي' },
  // facility_type
  HOSPITAL: { en: 'Hospital', ur: 'ہسپتال', sd: 'اسپتال' },
  RURAL_HEALTH_CENTER: { en: 'Rural health center', ur: 'دیہی مرکز صحت', sd: 'ڳوٺاڻو صحت مرڪز' },
  BASIC_HEALTH_UNIT: { en: 'Basic health unit', ur: 'بنیادی مرکز صحت', sd: 'بنيادي صحت يونٽ' },
  DISPENSARY: { en: 'Dispensary', ur: 'ڈسپنسری', sd: 'ڊسپينسري' },
  // essential_services_available
  OUTPATIENT: { en: 'Outpatient', ur: 'بیرونی مریض', sd: 'ٻاهرين مريض' },
  MATERNAL: { en: 'Maternal', ur: 'زچگی', sd: 'ماءُ جي صحت' },
  CHILD_HEALTH: { en: 'Child health', ur: 'بچوں کی صحت', sd: 'ٻارن جي صحت' },
  EMERGENCY: { en: 'Emergency', ur: 'ہنگامی', sd: 'ايمرجنسي' },
  LABORATORY: { en: 'Laboratory', ur: 'لیبارٹری', sd: 'ليبارٽري' },
  PHARMACY: { en: 'Pharmacy', ur: 'فارمیسی', sd: 'فارميسي' },
  // school_type
  PRIMARY: { en: 'Primary', ur: 'پرائمری', sd: 'پرائمري' },
  ELEMENTARY: { en: 'Elementary', ur: 'ایلیمنٹری', sd: 'ايليمينٽري' },
  SECONDARY: { en: 'Secondary', ur: 'سیکنڈری', sd: 'سيڪنڊري' },
  HIGHER_SECONDARY: { en: 'Higher secondary', ur: 'ہائر سیکنڈری', sd: 'هائر سيڪنڊري' },
};

/** Falls back to the raw DB label if the fieldKey isn't in the map — never
 *  crash/blank out on an unmapped field. */
export function translateFieldLabel(fieldKey: string, rawLabel: string, language: SupportedLanguage): string {
  return FIELD_LABELS[fieldKey]?.[language] ?? rawLabel;
}

/** Falls back to a human-readable version of the raw option value (matching
 *  DynamicFormRenderer's prior `option.replaceAll('_', ' ')` behavior) if the
 *  option isn't in the map. */
export function translateOptionLabel(option: string, language: SupportedLanguage): string {
  return OPTION_LABELS[option]?.[language] ?? option.replaceAll('_', ' ');
}
