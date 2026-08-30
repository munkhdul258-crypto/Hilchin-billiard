# Hilchin Billiard — Борлуулалтын удирдлагын систем

Билльярдны заал ажиллуулж буй хүнд зориулсан цэвэр вэб апп: ширээ бүрийн цаг
тооцоолол, орлогын тайлан/статистик, ажилтны эрх/нэвтрэлт.

Build алхамгүй (Next.js биш) — цэвэр HTML/CSS/JavaScript + [Supabase](https://supabase.com)
ашигласан тул Vercel дээр шууд, ямар ч тохиргоогүйгээр deploy хийгддэг.

## Файлын бүтэц

Бүх файл ганц түвшинд (folder ашиглаагүй) — GitHub-ийн веб upload/edit
цонхонд шууд ажиллахад амархан байхын тулд:

- `index.html` — Ширээнүүдийн самбар (эхлүүлэх/дуусгах, live timer)
- `login.html` — Ажилтны нэвтрэх хуудас
- `reports.html` — Орлогын тайлан, статистик, график
- `staff.html` — Ажилтны эрх удирдах (зөвхөн admin)
- `config.js` — Supabase URL/key тохиргоо (**эхлээд бөглөнө үү**)
- `schema.sql` — Өгөгдлийн сангийн бүтэц (Supabase дээр ажиллуулна)

## 1) Supabase тохируулах

1. [supabase.com](https://supabase.com) дээр шинэ project үүсгэ.
2. **SQL Editor** руу орж `schema.sql` файлын агуулгыг бүхэлд нь хуулж ажиллуул.
3. **Authentication → Providers**-с Email provider идэвхтэй эсэхийг шалга.
   "Confirm email"-ийг унтраавал (Settings → Auth) шинэ ажилтан шууд нэвтэрч чадна.
4. **Authentication → Users → Add user** дарж эхний (админ) ажилтныгаа имэйл +
   нууц үгээр нэмнэ.
5. Supabase дээр нэмсэн энэ хэрэглэгч анх удаагаа `staff` эрхтэй профайлтай
   автоматаар үүснэ (trigger). Түүнийг admin болгохын тулд:
   - **Table Editor → profiles** руу орж тухайн мөрийн `role`-ийг гараар
     `admin` болгож солино (эхний удаад л шаардлагатай, дараа нь /staff.html-ээс
     бусад ажилтныг удирдаж болно).
6. **Project Settings → API** хэсгээс `Project URL` болон `anon public` key-г
   аваад `config.js` файлд оруул.

## 2) GitHub

```bash
cd hilchin-billiard
git init
git add .
git commit -m "Hilchin Billiard: анхны хувилбар"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

## 3) Vercel дээр deploy хийх

1. [vercel.com](https://vercel.com) → **Add New → Project**.
2. Дээрх GitHub repo-г сонго (Import).
3. Framework Preset: **Other** (эсвэл "Static") — build command хоосон,
   output directory нь root (`.`) байна. Vercel ихэвчлэн үүнийг автоматаар
   зөв тааж, нэмэлт тохиргоо шаардахгүй.
4. **Deploy** дар. Хэдхэн секундэд амьд URL гарна.
5. Дараа нь `config.js`-ийг өөрчлөх бүрдээ GitHub рүү push хийхэд Vercel
   автоматаар дахин deploy хийнэ.

> Санамж: `config.js` дахь Supabase "anon public" key нь клиент код дотор
> ил гардаг ч энэ хэвийн зүйл — жинхэнэ хамгаалалт нь Supabase-ийн Row Level
> Security (`supabase/schema.sql` дотор тохируулсан) дээр байгаа. Service role
> key-г ХЭЗЭЭ Ч клиент код дотор бүү оруул.

## Онцлогууд

- **Ширээний цаг тооцоолол**: "Эхлүүлэх" дарахад session нээгдэж, live секундын
  тоолуур ажиллана; "Дуусгах" дарахад зарцуулсан цаг × цагийн үнээр дүн
  тооцоолж хадгална.
- **Realtime**: олон ажилтан өөр өөр төхөөрөмжөөс нэгэн зэрэг ажиллахад
  ширээний төлөв бүгдэд шууд шинэчлэгдэнэ.
- **Орлогын тайлан**: өдөр/долоо хоног/сар сонгож нийт орлого, session тоо,
  ширээ тус бүрийн задаргаа, өдөр тутмын графикийг харна.
- **Ажилтны эрх**: `staff` / `admin` гэсэн 2 түвшин. Admin ажилтны эрхийг
  удирдана, ширээ нэмнэ/устгана; staff зөвхөн ширээ ажиллуулж, тайлан харна.

## Дараагийн сайжруулалт (санал)

- Бар/зоогийн газрын нэмэлт борлуулалт (POS) нэмэх
- SMS/дэлгэц дээр дараалал харуулах
- Excel/CSV export тайлан
