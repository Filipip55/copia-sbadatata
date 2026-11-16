import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AccountSettings } from './account-settings';
import { AuthService } from '../../features/auth/services/auth.service';
import { UserProfile } from '../../features/auth/models/auth.models';

describe('AccountSettings', () => {
  let component: AccountSettings;
  let fixture: ComponentFixture<AccountSettings>;
  let mockAuthService: any;

  const mockProfile: UserProfile = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    avatar: null,
    theme_preference: 'light',
    date_joined: '2026-01-01T00:00:00Z',
    favorites_count: 0,
    wishlist_count: 0,
    username_change_available_at: null,
  };

  beforeEach(async () => {
    mockAuthService = {
      getProfile: () => of({ ...mockProfile }),
      updateAvatar: (avatar: number | null) => of({ ...mockProfile, avatar }),
      setCurrentUser: () => {},
      changeUsername: () => of(mockProfile),
      changePassword: () => of({ detail: 'ok' }),
      logout: () => of({ detail: 'ok' }),
      clearTokens: () => {},
    };

    await TestBed.configureTestingModule({
      imports: [AccountSettings],
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize profile with avatar null by default', () => {
    expect(component).toBeTruthy();
    expect(component.profile?.username).toBe('testuser');
    expect(component.selectedAvatar).toBeNull();
  });

  it('should allow selecting an avatar index', () => {
    component.selectAvatar(2);
    expect(component.selectedAvatar).toBe(2);

    component.selectAvatar(null);
    expect(component.selectedAvatar).toBeNull();
  });

  it('should save avatar choice and update profile', () => {
    component.selectAvatar(3);
    component.saveAvatar();

    expect(component.profile?.avatar).toBe(3);
    expect(component.message).toBe('Avatar updated successfully.');
  });
});
