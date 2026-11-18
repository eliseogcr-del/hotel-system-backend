import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappApiKeyGuard } from './whatsapp-api-key.guard';

function contextoConCabecera(valor: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: valor === undefined ? {} : { 'x-whatsapp-api-key': valor },
      }),
    }),
  } as unknown as ExecutionContext;
}

function configConClave(clave: string | undefined): ConfigService {
  return { get: () => clave } as unknown as ConfigService;
}

describe('WhatsappApiKeyGuard', () => {
  const CLAVE_REAL = 'clave-secreta-de-prueba-larga-123456';

  it('deniega (401) si no llega la cabecera', () => {
    const guard = new WhatsappApiKeyGuard(configConClave(CLAVE_REAL));
    expect(() => guard.canActivate(contextoConCabecera(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('deniega (401) con una clave incorrecta', () => {
    const guard = new WhatsappApiKeyGuard(configConClave(CLAVE_REAL));
    expect(() => guard.canActivate(contextoConCabecera('clave-incorrecta'))).toThrow(
      UnauthorizedException,
    );
  });

  it('deniega (401) con una clave del mismo largo pero distinta', () => {
    const guard = new WhatsappApiKeyGuard(configConClave(CLAVE_REAL));
    const mismoLargo = 'x'.repeat(CLAVE_REAL.length);
    expect(() => guard.canActivate(contextoConCabecera(mismoLargo))).toThrow(
      UnauthorizedException,
    );
  });

  it('deja pasar con la clave correcta', () => {
    const guard = new WhatsappApiKeyGuard(configConClave(CLAVE_REAL));
    expect(guard.canActivate(contextoConCabecera(CLAVE_REAL))).toBe(true);
  });

  it('deniega (401) siempre si WHATSAPP_PUBLIC_API_KEY no está configurada -- fallo cerrado, incluso con una clave que "coincidiría" con undefined', () => {
    const guard = new WhatsappApiKeyGuard(configConClave(undefined));
    expect(() => guard.canActivate(contextoConCabecera(CLAVE_REAL))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextoConCabecera(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
