import { CardComponent } from "./card.component.ts";
import { NgModule } from "ngjs-core";

function Injectable(): ClassDecorator {
  return () => {};
}
@Injectable()
class ThemeService {}

@NgModule({
  declarations: [CardComponent],
  imports: [],
  providers: [ThemeService],
})
export class AppModule {}
