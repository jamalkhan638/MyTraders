/** Error body returned by the api for every non-2xx response. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
}
