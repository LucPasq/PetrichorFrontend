import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonicModule, ReactiveFormsModule, HttpClientModule, CommonModule],
})
export class HomePage {
  rainForm: FormGroup;
  loading = false;
  progress = 0;
  finalResult: string = '';
  result: string = '';

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.rainForm = this.fb.group({
      date: ['', Validators.required],
      location: ['', Validators.required]
    });
  }

  async onSubmit() {
    if (this.rainForm.invalid) return;
    this.loading = true;
    this.progress = 0;
    this.result = 'Geocoding location...';
    this.finalResult = '';

    const form = this.rainForm.value;
    try {
      const geoData: any = await this.http.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.location)}`
      ).toPromise();
      if (!geoData || geoData.length === 0) throw new Error('Location not found!');
      const lat = geoData[0].lat;
      const lon = geoData[0].lon;
      const display_name = geoData[0].display_name;

      this.result = 'Loading rainfall prediction...';
      const resp: any = await this.http.post('http://localhost:5000/rainfall-summary', {
        date: form.date,
        lat,
        lon,
        location_name: display_name.split(',')[0]
      }).toPromise();

      const task_id = resp.task_id;

      // Poll for progress
      let finished = false;
      while (!finished) {
        const progressResp: any = await this.http.get(`http://localhost:5000/progress/${task_id}`).toPromise();
        this.progress = Math.round((progressResp.progress / progressResp.total) * 100);
        if (progressResp.status === 'done') {
          finished = true;
          const data = progressResp.result;
          // Compose friendly prediction sentence
          const prettyDate = this.formatDate(form.date);
          const locDisplay = display_name.split(',')[0];
          let weatherWord = '';
          switch (data.category) {
            case 'Sunny': weatherWord = 'sunny'; break;
            case 'Drizzle': weatherWord = 'drizzly'; break;
            case 'Showers': weatherWord = 'rainy'; break;
            case 'Heavy Rain': weatherWord = 'very rainy'; break;
            default: weatherWord = data.category.toLowerCase();
          }
          this.finalResult =
            `The predicted rainfall on <b>${prettyDate}</b> at <b>${locDisplay}</b> is <b>${data.average_rainfall_mm} mm</b>, which means it will probably be <b>${weatherWord}</b>.`;
          this.result =
            `<b>Mean rainfall (past 10 years):</b> ${data.average_rainfall_mm} mm<br>
             <b>Category:</b> ${data.category}`;
        } else {
          await this.sleep(350);
        }
      }
    } catch (err: any) {
      this.loading = false;
      this.progress = 0;
      this.result = "Could not find that location. Try a different city or town.";
      return;
    }
    this.loading = false;
  }

  formatDate(dateString: string): string {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const [year, month, day] = dateString.split("-");
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}