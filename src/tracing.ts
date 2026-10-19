import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export function initializeTracing() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Skip initialization if no OTLP endpoint is configured
  if (!endpoint) {
    return;
  }

  const sdk = new NodeSDK({
    instrumentations: [getNodeAutoInstrumentations()],
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
    }),
  });

  sdk.start();

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((err) => console.log('Failed to terminate tracing', err))
      .finally(() => process.exit(0));
  });
}

export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) {
    return undefined;
  }
  const spanContext = span.spanContext();
  return spanContext ? spanContext.traceId : undefined;
}

export function runWithTrace<T>(
  name: string,
  fn: () => T,
  tracer = trace.getTracer('default'),
): T {
  const span = tracer.startSpan(name);
  return context.with(trace.setSpan(context.active(), span), () => {
    try {
      const result = fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
