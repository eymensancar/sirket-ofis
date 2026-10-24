# 🏢 Şirket Ofisi

Claude'un çalıştığı piksel ofis: **https://eymensancar.github.io/sirket-ofis/**

- Claude çalışırken masasında kod yazar, iş bitince masasında uyur.
- Patron prim, maaş ve iyilik (kahve, yemek, teşekkür) verir; Claude'un morali ve çalışma özeni buna göre değişir.
- Durum `durum` dalındaki `durum.json` dosyasında tutulur. Claude'a verilen işlerin metni burada saklanmaz.

Patron komutları issue başlığı olarak verilir (sadece repo sahibi):

| Başlık | Ne olur |
| --- | --- |
| `Prim: 5000` | Prim (açıklama not olarak iletilir) |
| `Maaş öde` | Maaş ödenir |
| `Maaş: 75000` | Maaş değişir |
| `Kahve ısmarla` / `Yemek ısmarla` / `Teşekkür` | İyilik |

Claude Code hook'ları ve kurulum: özel `sirket` reposunda.
