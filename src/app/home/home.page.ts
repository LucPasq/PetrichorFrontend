import { Component, inject, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';

@Component({
  standalone: true,
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonicModule, ReactiveFormsModule, HttpClientModule, CommonModule],
})
export class HomePage implements OnDestroy {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toastController = inject(ToastController);
  private loadingController = inject(LoadingController);
  private destroy$ = new Subject<void>();
  
  rainForm: FormGroup;
  loading = false;
  progress = 0;
  finalResult: string = '';
  result: string = '';
  
  // HTTP timeout configurations
  private readonly GEOCODING_TIMEOUT = 15000; // 15 seconds for geocoding
  private readonly RAINFALL_REQUEST_TIMEOUT = 120000; // 2 minutes for rainfall prediction
  private readonly PROGRESS_POLL_TIMEOUT = 10000; // 10 seconds per progress poll
  private readonly MAX_POLLING_TIME = 180000; // 3 minutes total polling time
  private readonly POLL_INTERVAL = 1500; // 1.5 seconds between polls

  constructor() {
    this.rainForm = this.fb.group({
      date: ['', Validators.required],
      location: ['', [Validators.required, Validators.minLength(2)]]
    });
    
    // Set default date to today
    this.rainForm.patchValue({
      date: new Date().toISOString().split('T')[0]
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSubmit() {
    if (this.rainForm.invalid) {
      await this.showToast('Please fill in all fields correctly', 'warning');
      return;
    }
    
    this.loading = true;
    this.progress = 0;
    this.result = 'Geocoding location...';
    this.finalResult = '';

    const form = this.rainForm.value;
    try {
      // Geocoding with timeout for mobile networks
      const geoData: any = await firstValueFrom(
        this.http.get(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.location)}&limit=1`
        ).pipe(
          timeout(this.GEOCODING_TIMEOUT),
          takeUntil(this.destroy$)
        )
      );
      
      if (!geoData || geoData.length === 0) {
        throw new Error('Location not found');
      }
      
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      const display_name = geoData[0].display_name;

      this.result = 'Loading rainfall prediction...';
      
      const resp: any = await firstValueFrom(
        this.http.post('http://localhost:5000/rainfall-summary', {
          date: form.date,
          lat,
          lon,
          location_name: display_name.split(',')[0]
        }).pipe(
          timeout(this.RAINFALL_REQUEST_TIMEOUT), // 2 minutes timeout
          takeUntil(this.destroy$)
        )
      );

      const task_id = resp.task_id;

      // Enhanced polling with proper timeout and error handling
      let finished = false;
      const startTime = Date.now();
      let pollAttempts = 0;
      const maxPollAttempts = Math.ceil(this.MAX_POLLING_TIME / this.POLL_INTERVAL); // ~120 attempts over 3 minutes
      
      while (!finished && pollAttempts < maxPollAttempts) {
        try {
          const elapsedTime = Date.now() - startTime;
          if (elapsedTime > this.MAX_POLLING_TIME) {
            throw new Error('Processing is taking longer than expected. Please try again.');
          }
          
          const progressResp: any = await firstValueFrom(
            this.http.get(`http://localhost:5000/progress/${task_id}`)
              .pipe(
                timeout(this.PROGRESS_POLL_TIMEOUT),
                takeUntil(this.destroy$)
              )
          );
          
          // Update progress based on response structure
          if (progressResp.total && progressResp.progress !== undefined) {
            this.progress = Math.round((progressResp.progress / progressResp.total) * 100);
          } else if (progressResp.progress !== undefined) {
            this.progress = Math.round(progressResp.progress);
          }
          
          if (progressResp.status === 'done') {
            finished = true;
            const data = progressResp.result;
            
            // Store result in local storage for history
            this.storeResult(data, form.date, {
              name: display_name.split(',')[0],
              lat,
              lon
            });
            
            // Compose friendly prediction sentence
            const prettyDate = this.formatDate(form.date);
            const locDisplay = display_name.split(',')[0];
            let weatherWord = this.getWeatherDescription(data.category);
            
            this.finalResult =
              `The predicted rainfall on <b>${prettyDate}</b> at <b>${locDisplay}</b> is <b>${data.average_rainfall_mm} mm</b>, which means it will probably be <b>${weatherWord}</b>.`;
            this.result = `
              <div class="rainfall-item">
                <div class="rainfall-label">Mean rainfall (past 10 years)</div>
                <div class="rainfall-value">${data.average_rainfall_mm} mm</div>
              </div>
              <div class="category-item">
                <div class="category-label">Category</div>
                <div class="category-value category-${data.category.toLowerCase()}">${data.category}</div>
              </div>
            `;
          } else if (progressResp.status === 'error') {
            throw new Error(progressResp.message || 'Prediction failed');
          } else {
            // Continue polling - status is 'running' or similar
            await this.sleep(this.POLL_INTERVAL);
            pollAttempts++;
          }
        } catch (pollError: any) {
          console.warn(`Polling attempt ${pollAttempts + 1} failed:`, pollError);
          pollAttempts++;
          
          // If it's a timeout error on progress endpoint, continue polling
          if (pollError.name === 'TimeoutError' && pollAttempts < maxPollAttempts) {
            await this.sleep(this.POLL_INTERVAL);
            continue;
          }
          
          // For other errors, wait a bit longer before retry
          if (pollAttempts < maxPollAttempts) {
            await this.sleep(Math.min(this.POLL_INTERVAL * 2, 5000));
          }
        }
      }
      
      if (pollAttempts >= maxPollAttempts && !finished) {
        throw new Error('Processing is taking longer than expected. The server may still be working on your request. Please try again in a few minutes.');
      }
      
    } catch (err: any) {
      console.error('Prediction error:', err);
      this.loading = false;
      this.progress = 0;
      
      let errorMessage = 'An error occurred. Please try again.';
      if (err.message.includes('Location not found')) {
        errorMessage = 'Could not find that location. Try a different city or town.';
      } else if (err.message.includes('timeout') || err.message.includes('longer than expected')) {
        errorMessage = 'The request is taking longer than usual. Please check your connection and try again.';
      } else if (err.name === 'TimeoutError') {
        errorMessage = 'Request timed out. The server may be busy processing rainfall data. Please try again.';
      } else if (err.status === 0) {
        errorMessage = 'Unable to connect to server. Please check your internet connection.';
      } else if (err.message.includes('few minutes')) {
        errorMessage = err.message; // Use the specific message about waiting
      }
      
      this.result = errorMessage;
      await this.showToast(errorMessage, 'danger');
      return;
    }
    
    this.loading = false;
  }

  private getWeatherDescription(category: string): string {
    switch (category) {
      case 'Sunny': return 'sunny';
      case 'Drizzle': return 'drizzly';
      case 'Showers': return 'rainy';
      case 'Heavy Rain': return 'very rainy';
      default: return category.toLowerCase();
    }
  }

  private storeResult(data: any, date: string, location: any) {
    try {
      const stored = localStorage.getItem('petrichor_history') || '[]';
      const history = JSON.parse(stored);
      history.unshift({
        date,
        location,
        average_rainfall_mm: data.average_rainfall_mm,
        category: data.category,
        timestamp: new Date().toISOString()
      });
      // Keep only last 50 predictions
      localStorage.setItem('petrichor_history', JSON.stringify(history.slice(0, 50)));
    } catch (error) {
      console.warn('Could not save to history:', error);
    }
  }

  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
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