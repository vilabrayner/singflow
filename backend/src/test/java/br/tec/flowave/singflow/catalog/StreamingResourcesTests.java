package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class StreamingResourcesTests {
  StreamingSearch search(String type){var search=mock(StreamingSearch.class);when(search.provider()).thenReturn(new StreamingSearch.Provider(type,type,"fa-"+type));return search;}
  StreamingReferenceStore store(String type){var store=mock(StreamingReferenceStore.class);when(store.type()).thenReturn(type);return store;}
  @Test void dispatchesByTypeWithoutPlatformBranches(){
    var spotify=search("spotify");var deezer=search("deezer");var a=store("spotify");var b=store("deezer");var catalog=mock(CatalogService.class);
    var service=new StreamingResources(catalog,List.of(spotify,deezer),List.of(a,b));UUID id=UUID.randomUUID();
    when(b.get(id)).thenReturn(new StreamingReferenceStore.State(id,"https://www.deezer.com/track/1",2));
    when(deezer.search("Giz",1)).thenReturn(new StreamingSearch.Page(new StreamingSearch.Provider("deezer","deezer","fa-deezer"),List.of(),1,false));
    assertThat(service.providers("admin")).hasSize(2);assertThat(service.admin("admin",id,"deezer").icon()).isEqualTo("fa-deezer");
    assertThat(service.search("admin",id,"deezer","Giz",1).provider().type()).isEqualTo("deezer");verify(spotify,never()).search(anyString(),anyInt());
  }
  @Test void rejectsDuplicateMismatchedAndUnknownProviders(){
    var catalog=mock(CatalogService.class);
    assertThatThrownBy(()->new StreamingResources(catalog,List.of(search("spotify"),search("spotify")),List.of(store("spotify")))).isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(()->new StreamingResources(catalog,List.of(search("spotify")),List.of(store("deezer")))).isInstanceOf(IllegalStateException.class);
    var service=new StreamingResources(catalog,List.of(search("spotify")),List.of(store("spotify")));
    assertThatThrownBy(()->service.admin("admin",UUID.randomUUID(),"deezer")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(404));
  }
}
