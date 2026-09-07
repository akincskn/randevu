-- Sector enum'una DISCI değeri eklenir (spec satır 16: "ileride genişletilebilir enum").
ALTER TYPE "Sector" ADD VALUE IF NOT EXISTS 'DISCI';
