package br.tec.flowave.singflow.branding;

import java.awt.image.BufferedImage;
import java.io.*;
import java.security.*;
import java.util.*;
import javax.imageio.*;
import javax.imageio.stream.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class BrandingAssets {
  record Asset(UUID id,String url,int width,int height) {}
  record Content(byte[] bytes,String type,String digest) {}
  record Prepared(byte[] bytes,String type,int width,int height) {}
  private final JdbcClient jdbc;
  BrandingAssets(JdbcClient jdbc){this.jdbc=jdbc;}
  static Prepared prepare(byte[] input,boolean background){
    if(input==null||input.length==0||input.length>6*1024*1024)throw bad("Envie PNG ou JPEG de até 6 MB.");
    try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(input))){
      var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw bad("Imagem inválida. Use PNG ou JPEG.");
      var reader=readers.next();
      try{
        String format=reader.getFormatName();if(!format.equalsIgnoreCase("png")&&!format.equalsIgnoreCase("jpeg"))throw bad("Use PNG ou JPEG.");
        reader.setInput(stream,true,true);int width=reader.getWidth(0),height=reader.getHeight(0);
        if(width<1||height<1||width>8192||height>8192||(long)width*height>24000000)throw bad("A imagem excede o tamanho permitido.");
        var parameters=reader.getDefaultReadParam();parameters.setSourceSubsampling(Math.max(1,Math.max(width,height)/(background?1920:1024)),Math.max(1,Math.max(width,height)/(background?1920:1024)),0,0);
        var image=reader.read(0,parameters);int max=background?1920:1024;double scale=Math.min(1,(double)max/Math.max(image.getWidth(),image.getHeight()));
        var output=new BufferedImage(Math.max(1,(int)Math.round(image.getWidth()*scale)),Math.max(1,(int)Math.round(image.getHeight()*scale)),background?BufferedImage.TYPE_INT_RGB:BufferedImage.TYPE_INT_ARGB);
        var graphics=output.createGraphics();try{graphics.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC);graphics.drawImage(image,0,0,output.getWidth(),output.getHeight(),null);}finally{graphics.dispose();image.flush();}
        var bytes=new ByteArrayOutputStream();ImageIO.write(output,background?"jpeg":"png",bytes);
        var prepared=new Prepared(bytes.toByteArray(),background?"image/jpeg":"image/png",output.getWidth(),output.getHeight());output.flush();
        if(prepared.bytes().length>2*1024*1024)throw bad("Imagem muito detalhada. Reduza o arquivo e tente novamente.");
        return prepared;
      }finally{reader.dispose();}
    }catch(IOException|RuntimeException e){if(e instanceof ResponseStatusException status)throw status;throw bad("Não foi possível ler a imagem.");}
  }
  @Transactional
  public Asset upload(byte[] input,boolean background){
    var prepared=prepare(input,background);String digest;
    try{digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(prepared.bytes()));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    jdbc.sql("INSERT INTO singflow.branding_assets(id,digest,content,media_type,width,height) VALUES(?,?,?,?,?,?) ON CONFLICT(digest) DO NOTHING")
      .params(UUID.randomUUID(),digest,prepared.bytes(),prepared.type(),prepared.width(),prepared.height()).update();
    return jdbc.sql("SELECT id,width,height FROM singflow.branding_assets WHERE digest=?").param(digest)
      .query((rs,n)->{var id=rs.getObject("id",UUID.class);return new Asset(id,BrandingRegistry.assetUrl(id),rs.getInt("width"),rs.getInt("height"));}).single();
  }
  @Transactional(readOnly=true)
  public Content get(UUID id){return jdbc.sql("SELECT content,media_type,digest FROM singflow.branding_assets WHERE id=?").param(id)
    .query((rs,n)->new Content(rs.getBytes("content"),rs.getString("media_type"),rs.getString("digest"))).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));}
  private static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
