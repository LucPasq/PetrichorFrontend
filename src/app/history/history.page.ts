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

  ngOnInit() {
    this.loadResultsHistory();
  }

  async loadResultsHistory() {
    try {
      this.http.get<any[]>('http://localhost:5000/results-history').subscribe(data => {
        this.resultsHistory = data || [];
      });
    } catch (error) {
      console.error('Error loading results history:', error);
      this.resultsHistory = [];
    }
  }

  refreshHistory() {
    this.loadResultsHistory();
  }
}