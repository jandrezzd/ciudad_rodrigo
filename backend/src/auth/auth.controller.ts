import { Controller, Post, Body, BadRequestException, Logger, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { LoginDto } from './DTOs/login.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    this.logger.log(
      `Login attempt | document: "${body.document}" | length: ${body.document?.length} | passwordLength: ${body.password?.length}`
    );

    if (!body.document || !body.password) {
      throw new BadRequestException('Cedula y contraseña son requeridos');
    }
    return this.authService.login(body.document, body.password, body.origin);
  }

  @Get('verify')
  @UseGuards(AuthGuard('jwt'))
  verifyToken(@Req() req: any) {
    const { access_token } = this.authService.refreshToken(req.user);
    return { message: 'Token valido', access_token };
  }
}