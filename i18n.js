// ═══════════════════════════════════════════
// I18N.JS — English / Arabic with RTL
//
// Keys are the English strings themselves, so anything not yet translated
// falls back to readable English rather than a blank or a raw key.
//
// IMPORTANT: service types are DATA KEYS, not labels. Records store the English
// value ("Oil Change") and the schedule matches on it. Only the display passes
// through t(), so switching language never breaks a stored history.
// ═══════════════════════════════════════════

const I18N = {
    lang: 'en',
    KEY: 'autocare_lang',

    init() {
        this.lang = localStorage.getItem(this.KEY) || 'en';
        this.apply();
    },

    set(lang) {
        this.lang = (lang === 'ar') ? 'ar' : 'en';
        localStorage.setItem(this.KEY, this.lang);
        this.apply();
    },

    apply() {
        const html = document.documentElement;
        html.setAttribute('lang', this.lang);
        html.setAttribute('dir', this.lang === 'ar' ? 'rtl' : 'ltr');
    },

    // t('5,000 km left') or t('{n} km left', {n: '5,000'})
    t(s, vars) {
        if (s === null || s === undefined) return '';
        let out = s;
        if (this.lang !== 'en') {
            const table = this.dict[this.lang];
            if (table && Object.prototype.hasOwnProperty.call(table, s)) out = table[s];
        }
        if (vars) {
            Object.keys(vars).forEach(k => { out = out.split('{' + k + '}').join(vars[k]); });
        }
        return out;
    },

    dict: {
        ar: {
            // ── Navigation & pages ──
            'Dashboard': 'الرئيسية',
            'My Cars': 'سياراتي',
            'Services': 'الصيانة',
            'Fuel': 'الوقود',
            'Fuel Log': 'سجل الوقود',
            'Expenses': 'المصاريف',
            'Warranty': 'الضمان',
            'Warranty Center': 'مركز الضمان',
            'Reminders': 'التذكيرات',

            // ── Common actions ──
            'Save': 'حفظ',
            'Cancel': 'إلغاء',
            'Edit': 'تعديل',
            'Delete': 'حذف',
            'Done': 'تم',
            'Undo': 'تراجع',
            'Close': 'إغلاق',
            'Update': 'تحديث',
            'Restore': 'استعادة',
            'Log': 'تسجيل',
            'View': 'عرض',
            'Add New': 'إضافة',
            '+ Add Car': '+ إضافة سيارة',
            '+ Add Service': '+ إضافة صيانة',
            '+ Add Fuel': '+ إضافة وقود',
            '+ Add Expense': '+ إضافة مصروف',
            '+ Add Reminder': '+ إضافة تذكير',
            '+ Add Your First Car': '+ أضف سيارتك الأولى',
            '+ Add Bill': '+ إضافة فاتورة',
            '+ Custom': '+ مخصص',
            '+ Add Mechanic': '+ إضافة ورشة',
            'Tires': 'الإطارات',
            'Print History': 'طباعة السجل',
            'View receipt': 'عرض الفاتورة',
            'Edit': 'تعديل',
            'Add receipt / edit': 'إضافة فاتورة / تعديل',
            'Save image': 'حفظ الصورة',

            // ── Quick actions ──
            'Update km': 'تحديث العداد',
            'Quick Fuel': 'وقود سريع',
            'Quick Service': 'صيانة سريعة',
            'Repeat': 'تكرار',
            'Add Reminder': 'إضافة تذكير',
            'Back Up': 'نسخة احتياطية',
            'Settings': 'الإعدادات',

            // ── Stats ──
            'Cars': 'السيارات',
            'Total Spent': 'إجمالي المصروف',
            'Upcoming': 'القادمة',

            // ── Statuses ──
            'OK': 'سليم',
            'Soon': 'قريباً',
            'Overdue': 'متأخر',
            'Active': 'ساري',
            'Expired': 'منتهي',
            'Valid': 'ساري',
            'Ending soon': 'ينتهي قريباً',
            'Not tracked': 'غير متتبع',
            'Good': 'جيد',
            'Fair': 'مقبول',
            'Needs Attention': 'يحتاج انتباه',
            'New': 'جديد',
            'Service': 'صيانة',
            'No bill': 'بدون فاتورة',

            // ── Action Center ──
            'Action Center': 'ما يحتاج انتباهك',
            'All caught up': 'كل شيء على ما يرام',
            'No maintenance, documents, or alerts need attention right now.': 'لا توجد صيانة أو وثائق أو تنبيهات تحتاج انتباهك الآن.',

            // ── Car card ──
            'Odometer': 'العداد',
            'Plate': 'اللوحة',
            'Running Cost': 'تكلفة التشغيل',
            'Documents': 'الوثائق',
            'Maintenance Schedule': 'جدول الصيانة',
            'Insurance': 'التأمين',
            'Registration': 'الاستمارة',
            'Fahes': 'الفحص الدوري',
            'est.': 'تقديري',
            'No reading yet': 'لا توجد قراءة بعد',
            'Running Cost (last 12 months)': 'تكلفة التشغيل (آخر ١٢ شهر)',
            'SAR maintenance': 'ريال صيانة',
            'km per year': 'كم سنوياً',
            'SAR/km upkeep': 'ريال/كم صيانة',
            'Worth keeping': 'يستحق الاحتفاظ به',
            'Keep an eye on it': 'راقبها',
            'Consider replacing': 'فكّر في استبدالها',

            // ── Forms ──
            'Make': 'الشركة',
            'Model': 'الموديل',
            'Year': 'سنة الصنع',
            'Current Mileage (km)': 'العداد الحالي (كم)',
            'License Plate': 'رقم اللوحة',
            'Color': 'اللون',
            'Insurance Expiry': 'انتهاء التأمين',
            'Registration (Istimara) Expiry': 'انتهاء الاستمارة',
            'Fahes (Inspection) Expiry': 'انتهاء الفحص الدوري',
            'Manufacturer Warranty Until': 'ضمان الوكالة حتى',
            'Timing Belt or Chain': 'سير أم جنزير التوقيت',
            'Market Value (SAR)': 'القيمة السوقية (ريال)',
            'Recall / Safety Notes': 'ملاحظات استدعاء / سلامة',
            'Car': 'السيارة',
            'Date': 'التاريخ',
            'Total Cost (SAR)': 'التكلفة الإجمالية (ريال)',
            'Mileage at Service (km)': 'العداد وقت الصيانة (كم)',
            'Notes': 'ملاحظات',
            'Optional...': 'اختياري...',
            'Service Type': 'نوع الصيانة',
            'Services Performed (select all that apply)': 'الصيانة المنفذة (اختر كل ما ينطبق)',
            'Brake Pad Thickness (mm)': 'سماكة فحمات الفرامل (ملم)',
            'Reminder For': 'تذكير بـ',
            'Due Date': 'تاريخ الاستحقاق',
            'Due Mileage (km)': 'العداد المستحق (كم)',
            'Liters': 'اللترات',
            'Price/Liter (SAR)': 'سعر اللتر (ريال)',
            'Station': 'المحطة',
            'Odometer (km)': 'العداد (كم)',
            'Current Odometer (km)': 'العداد الحالي (كم)',
            'Reading Date': 'تاريخ القراءة',

            // ── Bills ──
            'Bills & Receipts': 'الفواتير',
            'Parts': 'قطع غيار',
            'Labour': 'أجرة عمل',
            'Other': 'أخرى',
            'Shop / store name': 'اسم المحل',
            'Warranty months': 'ضمان بالأشهر',
            'Warranty km': 'ضمان بالكيلومترات',
            'Attach receipt': 'إرفاق فاتورة',
            'Replace receipt': 'استبدال الفاتورة',
            'Receipt attached': 'تم إرفاق الفاتورة',
            'Shop': 'المحل',
            'Paid': 'المدفوع',
            'Cover': 'التغطية',
            'Until': 'حتى',
            'Or at': 'أو عند',

            // ── Service types (display only — stored value stays English) ──
            'Oil Change': 'تغيير الزيت',
            'Tire Rotation': 'تدوير الإطارات',
            'Brake Inspection': 'فحص الفرامل',
            'Front Brake Pads': 'فحمات الفرامل الأمامية',
            'Rear Brake Pads': 'فحمات الفرامل الخلفية',
            'Front Brake Discs': 'ديسكات الفرامل الأمامية',
            'Rear Brake Discs': 'ديسكات الفرامل الخلفية',
            'Brake Fluid': 'زيت الفرامل',
            'Brake Pads': 'فحمات الفرامل',
            'Air Filter': 'فلتر الهواء',
            'Cabin Air Filter': 'فلتر المكيف',
            'AC Service': 'صيانة المكيف',
            'Transmission': 'ناقل الحركة (القير)',
            'Coolant Flush': 'تغيير سائل التبريد',
            'Battery': 'البطارية',
            'Spark Plugs': 'البواجي',
            'Timing Belt': 'سير التوقيت',
            'Alignment': 'ضبط زوايا العجلات',
            'Suspension': 'نظام التعليق',
            'Wheel Bearing': 'رمان بلي العجل',
            'Registration Renewal': 'تجديد الاستمارة',
            'Insurance Renewal': 'تجديد التأمين',
            'Inspection': 'الفحص',

            // ── Empty states ──
            'No cars added yet': 'لم تتم إضافة سيارات بعد',
            'No services recorded': 'لا توجد صيانة مسجلة',
            'No services yet': 'لا توجد صيانة بعد',
            'No fuel logs yet': 'لا يوجد سجل وقود بعد',
            'No reminders set': 'لا توجد تذكيرات',
            'No upcoming reminders': 'لا توجد تذكيرات قادمة',
            'No expenses yet': 'لا توجد مصاريف بعد',
            'No part warranties yet': 'لا توجد ضمانات قطع بعد',

            // ── Settings ──
            'Language': 'اللغة',
            'English': 'English',
            'Arabic': 'العربية',
            'Driving Climate': 'ظروف القيادة',
            'Normal': 'عادية',
            'Severe (Hot climate / Saudi Arabia)': 'قاسية (حر شديد / السعودية)',
            'Backup': 'النسخ الاحتياطي',
            'Export Backup': 'تصدير نسخة',
            'Import Backup': 'استيراد نسخة',
            'Recently Deleted': 'المحذوفات مؤخراً',
            'Receipt Storage': 'مساحة الفواتير',
            'Notifications': 'الإشعارات',
            'Mechanics & Shops': 'الورش والمحلات',
            'Never backed up': 'لم يتم النسخ الاحتياطي أبداً',
            'Nothing deleted in the last 30 days.': 'لا يوجد محذوفات خلال آخر ٣٠ يوم.',
            'No receipt photos stored yet': 'لا توجد صور فواتير محفوظة',
            'Backup shared ({mb} MB)': 'تم مشاركة النسخة الاحتياطية ({mb} ميجابايت)',
            'Backup saved ({mb} MB)': 'تم حفظ النسخة الاحتياطية ({mb} ميجابايت)',
            '{n} car(s)': '{n} سيارة',
            '{n} service record(s)': '{n} سجل صيانة',
            '{n} receipt photo(s)': '{n} صورة فاتورة',
            '({n} could not be read)': '({n} تعذّرت قراءتها)',
            'Settings and custom intervals included': 'الإعدادات والفترات المخصصة مضمّنة',
            'Save it to Files or iCloud Drive so your history is not on this phone alone.': 'احفظها في الملفات أو iCloud Drive حتى لا يبقى سجلك على هذا الجهاز وحده.',
            'Keep this file in Files or iCloud Drive.': 'احتفظ بهذا الملف في الملفات أو iCloud Drive.',
            'Could not build the backup file.': 'تعذّر إنشاء ملف النسخة الاحتياطية.',

            // ── Insights ──
            'Service Insights': 'تحليل الصيانة',
            'More often than the schedule asks': 'أكثر من الجدول الموصى به',
            'Matching the schedule': 'مطابق للجدول',
            'Going further than recommended': 'أبعد من الموصى به',
            'Avg cost': 'متوسط التكلفة',
            'Recommended': 'الموصى به',
            'You': 'أنت',

            // ── Analytics ──
            'Expense Breakdown': 'توزيع المصاريف',
            'Cost per Car': 'التكلفة لكل سيارة',
            'Driving Pattern': 'نمط القيادة',
            'km/day': 'كم/يوم',
            'km/month': 'كم/شهر',
            'km/year (est)': 'كم/سنة (تقديري)',
            '6-Month Cost Forecast': 'توقع تكلفة ٦ أشهر',
            'Running Cost (per km)': 'تكلفة التشغيل (لكل كم)',
            'Monthly Expenses': 'المصاريف الشهرية',
            'Recent Services': 'آخر الصيانات',
            'Upcoming Reminders': 'التذكيرات القادمة',
            'Total Fuel Cost': 'إجمالي تكلفة الوقود',
            'Total Liters': 'إجمالي اللترات',
            'Avg Consumption': 'متوسط الاستهلاك',
            'Cost per km': 'التكلفة لكل كم',
            'Fuel Consumption Trend': 'اتجاه استهلاك الوقود',

            // ── Table headers ──
            'Mileage': 'العداد',
            'Bills': 'الفواتير',
            'Cost': 'التكلفة',
            'Actions': 'إجراءات',
            'Description': 'الوصف',
            'Category': 'التصنيف',
            'Total': 'الإجمالي',
            'Still covered': 'ما زال مغطى',

            // ── Units / small words ──
            'km': 'كم',
            'SAR': 'ريال',
            'months': 'شهر',
            'days': 'يوم',
            'today': 'اليوم',
            'Search services, shops or notes': 'ابحث في الصيانة أو المحلات أو الملاحظات',
            'Nothing matched your search': 'لا توجد نتائج مطابقة',
            'Snooze 1w': 'تأجيل أسبوع',
            'page': 'صفحة',
            'pages': 'صفحات',
            'failed': 'فشل',
            'Compressing…': 'جاري الضغط…',
            'Could not read those images': 'تعذّرت قراءة الصور',
            'Tire Brand': 'ماركة الإطار',
            'Tire Size': 'مقاس الإطار',
            'All Cars': 'كل السيارات',
            'Bills & Receipts': 'الفواتير',
            'Language': 'اللغة',
            // ── Action Center items ──
            'No backup yet': 'لا توجد نسخة احتياطية',
            'Your records live only in this browser — save a copy to Files or iCloud Drive': 'سجلاتك محفوظة في هذا المتصفح فقط — احفظ نسخة في الملفات أو iCloud',
            'Last backup was {d} days ago': 'آخر نسخة احتياطية قبل {d} يوم',
            'You have changes since then — save a fresh copy': 'لديك تغييرات بعدها — احفظ نسخة جديدة',
            'Back up': 'احفظ نسخة',
            'Add an odometer reading': 'أضف قراءة العداد',
            'needed to track km-based services': 'مطلوبة لتتبع الصيانة بالكيلومترات',
            'Odometer not updated in {d} days': 'لم يُحدَّث العداد منذ {d} يوم',
            '{type} overdue': '{type} متأخرة',
            '{type} due soon': '{type} قريباً',
            'Insurance expired': 'انتهى التأمين',
            'Insurance expires in {d} days': 'ينتهي التأمين خلال {d} يوم',
            'Fahes (inspection) expired': 'انتهى الفحص الدوري',
            'Fahes expires in {d} days': 'ينتهي الفحص الدوري خلال {d} يوم',
            'Registration (Istimara) expired': 'انتهت الاستمارة',
            'Registration expires in {d} days': 'تنتهي الاستمارة خلال {d} يوم',
            'renew {what} first': 'جدّد {what} أولاً',
            'Vehicle warranty ends in {d} days': 'ينتهي ضمان الوكالة خلال {d} يوم',
            'use it before it expires': 'استفد منه قبل انتهائه',
            'Fuel use up {p}%': 'ارتفع استهلاك الوقود {p}%',
            'Warranty ending: {part}': 'ينتهي ضمان: {part}',
            'Tyres are {y} years old — replace': 'عمر الإطارات {y} سنة — استبدلها',
            'Tyres are {y} years old': 'عمر الإطارات {y} سنة',
            'rubber hardens with age regardless of tread': 'المطاط يتصلب مع العمر بغض النظر عن النقشة',
            '{t} at {mm} mm — replace now': '{t} عند {mm} ملم — استبدلها الآن',
            '{t} low ({mm} mm)': '{t} منخفضة ({mm} ملم)',
            'replace at 3 mm': 'الاستبدال عند ٣ ملم',
            'measured {d}': 'قيست في {d}',
            'last read {km} km on {d}': 'آخر قراءة {km} كم في {d}',
            '{n} items': '{n} عناصر',
            '{n} item': 'عنصر واحد',
            '+ {n} more': '+ {n} أخرى',
            // ── health / trend ──
            '{n} services': '{n} صيانة',
            '{n} overdue': '{n} متأخرة',
            'vs last mo.': 'مقارنة بالشهر الماضي',
            // ── Periodic technical inspection (Fahes) ──
            'Periodic Inspection': 'الفحص الدوري',
            'Result': 'النتيجة',
            'Passed': 'ناجح',
            'Passed with advisories': 'ناجح مع ملاحظات',
            'Failed': 'راسب',
            'Last inspection failed': 'آخر فحص راسب',
            'Certificate valid until': 'الشهادة سارية حتى',
            'Updates the Fahes date on your car': 'يحدّث تاريخ الفحص الدوري في بيانات سيارتك',
            'Inspection centre': 'مركز الفحص',
            'Due on your {car}': 'مستحق على {car}',
            'Routine': 'الدورية',
            'Brakes': 'الفرامل',
            'Engine & drivetrain': 'المحرك ونقل الحركة',
            'Steering & suspension': 'التوجيه والتعليق',
            'Electrical & climate': 'الكهرباء والتكييف',
            'Saving this records the car as belt-driven, so timing belt reminders start working.': 'الحفظ يسجّل السيارة كسير توقيت، لتبدأ تذكيرات سير التوقيت بالعمل.',
            'e.g. Fahes Al-Kharj Road': 'مثال: فحص طريق الخرج',
            'Re-test after a failed inspection': 'إعادة فحص بعد رسوب',
            'Expires': 'ينتهي',
            'Expires': 'ينتهي',
            'Active': 'ساري',
            '{d}d left': 'باقي {d} يوم',
            'Every {km} km / {m} mo': 'كل {km} كم / {m} شهر',
            '{d} days overdue': 'متأخر {d} يوم',
            'in {d} days': 'خلال {d} يوم',
            'in {m} months': 'خلال {m} شهر',
            '{km} km left': 'باقي {km} كم',
            '{km} km over': 'تجاوز {km} كم',
            'Not set': 'غير محدد',
            'Tap to add': 'اضغط للإضافة',
            'Expiry date': 'تاريخ الانتهاء',
            'Date of inspection': 'تاريخ الفحص',
            'Cost (SAR)': 'التكلفة (ريال)',
            'Record the inspection you just had. A pass updates the expiry date automatically.': 'سجّل الفحص الذي أجريته. النجاح يحدّث تاريخ الانتهاء تلقائياً.',
            'Enter the expiry date printed on your certificate. Everything below it is optional.': 'أدخل تاريخ الانتهاء المدوّن في شهادتك. كل ما تحته اختياري.',
            'The date printed on your certificate.': 'التاريخ المدوّن في شهادتك.',
            'Filling in a centre or a cost also saves this to your service history.': 'إدخال المركز أو التكلفة يحفظ هذا أيضاً في سجل الصيانة.',
            'Not recorded': 'غير مسجّل',
            'Counted from today': 'محسوبة من اليوم',
            'Certificate expires': 'انتهاء الشهادة',
            'Suggested a year after the date above — edit it if your certificate says otherwise.': 'مقترح بعد سنة من التاريخ أعلاه — عدّله إذا كانت شهادتك تذكر غير ذلك.',
            'Update the expiry date shown on the document.': 'حدّث تاريخ الانتهاء المدوّن في الوثيقة.',
            'Usually one year from the inspection date.': 'عادةً سنة من تاريخ الفحص.',
            'A failed inspection gives no cover — a re-test reminder is set for 30 days.': 'الرسوب لا يمنح صلاحية — سيتم ضبط تذكير بإعادة الفحص خلال ٣٠ يوم.',
            'Please choose the expiry date.': 'الرجاء اختيار تاريخ الانتهاء.',
            'Please choose the certificate expiry date.': 'الرجاء اختيار تاريخ انتهاء الشهادة.',
            'Maintenance': 'الصيانة',
            'Due': 'مستحق',
            'Total spend ÷ distance driven (fuel + maintenance)': 'إجمالي المصروف ÷ المسافة المقطوعة (وقود + صيانة)',
            'Estimated upcoming maintenance over the next 6 months': 'الصيانة المتوقعة خلال الأشهر الستة القادمة',
            'Log the same service twice, each with its mileage, and this will compare the interval you actually achieve against the recommended one.': 'سجّل نفس الصيانة مرتين مع العداد، وسنقارن الفترة الفعلية بالفترة الموصى بها.',
            'Add a bill to a service and give it a warranty in months or km — it will appear here.': 'أضف فاتورة للصيانة مع ضمان بالأشهر أو الكيلومترات — وستظهر هنا.',
            'Add a market value in Edit to see whether this car is still worth keeping.': 'أضف القيمة السوقية من التعديل لمعرفة إن كانت السيارة تستحق الاحتفاظ بها.',
            'Auto: from the date on your car record': 'تلقائي: من التاريخ المسجّل في بيانات سيارتك',
            'Tyres': 'الإطارات',
            'Dammam Centre': 'مركز الدمام',
            'Khobar Centre': 'مركز الخبر',
            'Valid until': 'سارية حتى',
            'Standard one year': 'المدة المعتادة سنة',
            'Certificate': 'الشهادة',
            'None — a re-test is due in 30 days': 'لا توجد — إعادة الفحص خلال ٣٠ يوم',
            'Please choose the date of inspection.': 'الرجاء اختيار تاريخ الفحص.',
            'Due today': 'مستحق اليوم',
        }
    }
};

// Short helper used throughout the UI
function t(s, vars) { return I18N.t(s, vars); }

// Re-translate any element carrying data-i18n (static markup in index.html)
I18N.translateDOM = function () {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-ph')));
    });
};
