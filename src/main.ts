import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// Import required icons
import { addIcons } from 'ionicons';
import { home, time, timeOutline, cloudOutline, refreshOutline } from 'ionicons/icons';

// Register the icons
addIcons({
  home,
  time,
  'time-outline': timeOutline,
  'cloud-outline': cloudOutline,
  'refresh-outline': refreshOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
