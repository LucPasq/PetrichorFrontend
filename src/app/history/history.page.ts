import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  imports: [IonicModule, HttpClientModule, CommonModule],
})
export class HistoryPage implements OnInit {
  private http = inject(HttpClient);
  resultsHistory: any[] = [];
  loading = false;

  ngOnInit() {
    this.loadResultsHistory();
  }

  async loadResultsHistory() {
    if (this.loading) return;
    
    this.loading = true;
    try {
      this.http.get<any[]>('http://localhost:5000/results-history').subscribe({
        next: (data) => {
          this.resultsHistory = data || [];
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading results history:', error);
          this.resultsHistory = [];
          this.loading = false;
        }
      });
    } catch (error) {
      console.error('Error loading results history:', error);
      this.resultsHistory = [];
      this.loading = false;
    }
  }

  refreshHistory() {
    this.loadResultsHistory();
  }

  // TrackBy function for better performance with ngFor
  trackByDate(index: number, item: any): string {
    return item.date + (item.location?.lat || '') + (item.location?.lon || '');
  }
}