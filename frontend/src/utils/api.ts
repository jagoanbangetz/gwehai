/**
 * API client utility for making authenticated requests to the backend
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const user = localStorage.getItem('scout_user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        // If we have a token, add it to headers
        if (userData.token || userData.access_token) {
          config.headers.Authorization = `Bearer ${userData.token || userData.access_token}`;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear user and redirect to login
      localStorage.removeItem('scout_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
