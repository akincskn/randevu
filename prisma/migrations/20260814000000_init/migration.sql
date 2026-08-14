-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- ============================================================================
-- ELLE EKLENDİ (Prisma tarafından üretilmedi)
-- ============================================================================
-- btree_gist, GiST index'lerinde "B-tree benzeri" tiplerin (burada TEXT olan
-- "businessId") kullanılabilmesini sağlar. Dosyanın SONUNDAKİ EXCLUDE kısıtı
-- `"businessId" WITH =` içerdiği için bu eklenti ZORUNLUDUR.
-- Konum notu: Prisma'nın ürettiği `CREATE SCHEMA` satırının HEMEN ARDINA konuldu,
-- dosyanın en başına değil — eklenti varsayılan olarak `public` şemasına kurulur,
-- dolayısıyla o şema önce var olmalıdır.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('BERBER', 'KUAFOR');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "sector" "Sector" NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "opensAtMinute" INTEGER,
    "closesAtMinute" INTEGER,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHoursException" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "opensAtMinute" INTEGER,
    "closesAtMinute" INTEGER,

    CONSTRAINT "WorkingHoursException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Business_email_key" ON "Business"("email");

-- CreateIndex
CREATE INDEX "Service_businessId_idx" ON "Service"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_businessId_dayOfWeek_key" ON "WorkingHours"("businessId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHoursException_businessId_date_key" ON "WorkingHoursException"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_publicToken_key" ON "Appointment"("publicToken");

-- CreateIndex
CREATE INDEX "Appointment_businessId_status_idx" ON "Appointment"("businessId", "status");

-- CreateIndex
CREATE INDEX "Appointment_businessId_startsAt_idx" ON "Appointment"("businessId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_businessId_idx" ON "PushSubscription"("businessId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHoursException" ADD CONSTRAINT "WorkingHoursException_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ELLE EKLENDİ (Prisma tarafından üretilmedi) — hizmet süresi pozitif olmalı
-- ============================================================================
-- Aşağıdaki EXCLUDE kısıtının bilinen tek boşluğunu kapatır: startsAt == endsAt
-- olan sıfır uzunlukta bir randevu BOŞ aralık üretir, boş aralık ise hiçbir şeyle
-- kesişmez (&& false döner) ve EXCLUDE tarafından YAKALANMAZ. endsAt değeri
-- Service.durationMinutes'ten hesaplandığı için, süreyi kaynağında pozitif tutmak
-- sıfır uzunlukta randevunun hiç oluşmamasını garanti eder.
--
-- Prisma şema dilinde CHECK kısıtı İFADE EDİLEMEZ, bu yüzden elle eklenmiştir.
-- Sonraki `prisma migrate diff` çağrılarında "drift" olarak görünebilir — SİLMEYİN.
ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMinutes_positive_check"
    CHECK ("durationMinutes" > 0);

-- ============================================================================
-- ELLE EKLENDİ (Prisma tarafından üretilmedi) — PROJECT_SPEC.md satır 43-44
-- ============================================================================
-- "Slot çakışması (iki müşterinin aynı saati alması) veritabanı seviyesinde
--  engellenir (unique constraint + transaction, sadece UI kontrolü değil)."
--
-- Neden `@@unique([businessId, startsAt])` DEĞİL — iki ayrı nedenle yetersiz:
--   1) Koşulsuz unique, İPTAL EDİLMİŞ (CANCELLED) randevunun da slotu sonsuza
--      kadar bloklamasına yol açar; iptal edilen saat bir daha hiç satılamaz.
--   2) Yalnızca AYNI başlangıç saatini engeller. 10:00 (60 dk) randevusu varken
--      10:30 randevusu DB düzeyinden GEÇERDİ — gerçek ARALIK çakışması korumasız.
-- Bu yüzden önceki taslaktaki partial unique index KALDIRILDI; aşağıdaki EXCLUDE
-- kısıtı onun sağladığı korumayı zaten tamamen kapsıyor (aynı startsAt => aralıklar
-- kesişir => reddedilir). İkinci bir index gereksiz bakım ve yazma yüküdür.
--
-- PREDICATE — hangi durumlar slotu TUTAR:
--   TUTAR:  PENDING (spec satır 23), CONFIRMED (satır 26),
--           COMPLETED ve NO_SHOW (geçmiş kayıt: o saat fiilen doluydu)
--   BIRAKIR: CANCELLED (iptal), EXPIRED (spec satır 32-35 zaman aşımı)
--
-- Predicate BİLEREK olumsuz yazıldı: `NOT IN ('CANCELLED','EXPIRED')`.
-- Gerekçe (fail-safe): enum'a ileride yeni bir durum eklenip bu predicate
-- güncellenmezse, olumlu liste (`IN (...)`) kullanılsaydı yeni durum sessizce
-- slotu BIRAKIRDI => çift rezervasyon. Olumsuz listede ise yeni durum varsayılan
-- olarak slotu TUTAR => en kötü ihtimalle fazladan katı olur, veri bozulmaz.
--
-- '[)' yarı-açık sınır: BİTİŞİK randevular (10:00-10:30 ve 10:30-11:00) çakışma
-- SAYILMAZ. tstzrange kullanılıyor çünkü startsAt/endsAt TIMESTAMPTZ'dir; bu
-- yapıcı IMMUTABLE'dır ve index ifadesinde kullanılabilir (düz TIMESTAMP ile
-- yapılacak çevrim yalnızca STABLE olurdu ve PostgreSQL kısıtı reddederdi).
--
-- Bu kısıt Prisma şema dilinde İFADE EDİLEMEZ (ne EXCLUDE ne partial predicate),
-- bu yüzden elle eklenmiştir. Sonraki `prisma migrate diff` çağrılarında "drift"
-- olarak görünebilir — SİLMEYİN.
--
-- Uygulama notu: ihlal Postgres 23P01 (exclusion_violation) döndürür. Bu kod,
-- unique ihlalinin (23505) aksine Prisma'da P2002'ye EŞLENMEZ; ham hata koduna
-- bakılıp "slot dolu" olarak ele alınmalıdır.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap_excl"
    EXCLUDE USING gist (
        "businessId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("status" NOT IN ('CANCELLED', 'EXPIRED'));

