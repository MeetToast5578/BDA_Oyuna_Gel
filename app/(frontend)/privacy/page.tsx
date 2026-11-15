import type { Metadata } from 'next'

import { InfoPage } from '@/components/site/InfoPage'

export const metadata: Metadata = { title: 'Məxfilik' }

export default function PrivacyPage() {
  return (
    <InfoPage title="Məxfilik" lead="Məlumatlarından necə istifadə etdiyimiz haqqında qısa məlumat.">
      <ul>
        <li>Hesabındakı email və telefon nömrəsini yalnız sən və platforma administratorları görə bilər.</li>
        <li>Oyunlarda adın və profil şəklin digər oyunçulara görünür.</li>
        <li>
          Host kimi qeyd etdiyin telefon nömrəsi yalnız oyununa qoşulan oyunçulara göstərilir; qoşulmayanlar onu görə
          bilməz.
        </li>
        <li>Google ilə daxil olduqda yalnız adın, email ünvanın və Google hesab identifikatorun saxlanılır.</li>
      </ul>
      <h2>Sayt analitikası</h2>
      <p>Razılıq verdikdə Google Analytics vasitəsilə səhifə baxışlarını və oyun yaratmaq, oyuna və gözləmə siyahısına qoşulmaq, idman növü seçmək və daxil olmaq kimi əməliyyatları ölçürük. Razılıq vermədikdə analitika yüklənmir və sayt işləməyə davam edir.</p>
      <p>Analitikaya ad, email, telefon nömrəsi, şəxsi qrup linkləri və axtarış mətnləri göndərmirik. Səhifə ünvanlarındakı identifikatorları və dəvət kodlarını ümumi şablonlarla əvəz edirik. Google cihaz və istifadə məlumatlarını öz qaydalarına uyğun emal edir. Seçiminizi 180 gün saxlayırıq; səhifənin aşağısındakı “Analitika seçimləri” ilə razılığınızı dəyişə bilərsiniz.</p>
    </InfoPage>
  )
}
