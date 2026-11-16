import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/** Bootstraps the root component with the application-wide providers. */
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
