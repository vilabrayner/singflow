package br.tec.flowave.singflow.branding;
import static org.assertj.core.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
class BrandingAssetsTests {
  byte[] png(int width,int height)throws Exception{var buffer=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(width,height,BufferedImage.TYPE_INT_ARGB),"png",buffer);return buffer.toByteArray();}
  @Test void logoIsValidatedResizedAndReencodedWithoutCropping()throws Exception{var result=BrandingAssets.prepare(png(1600,800),false);assertThat(result.type()).isEqualTo("image/png");assertThat(result.width()).isEqualTo(1024);assertThat(result.height()).isEqualTo(512);}
  @Test void backgroundPreservesItsAspectAndUsesAnOptimizedJpeg()throws Exception{var result=BrandingAssets.prepare(png(2560,1440),true);assertThat(result.type()).isEqualTo("image/jpeg");assertThat(result.width()).isEqualTo(1920);assertThat(result.height()).isEqualTo(1080);}
  @Test void malformedOversizedAndSvgUploadsAreRejected(){for(byte[] input:new byte[][]{new byte[0],new byte[6*1024*1024+1],"<svg onload='alert(1)'></svg>".getBytes(),"not an image".getBytes()})assertThatThrownBy(()->BrandingAssets.prepare(input,false)).isInstanceOf(ResponseStatusException.class);}
}
